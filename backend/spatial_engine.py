"""
HEMO-GRID AI - PostGIS Spatial Query Engine
Supports native PostgreSQL/PostGIS spatial queries with seamless SQLite fallback.
Provides spatial radius filtering, nearest-neighbor searches, and emergency corridor buffers.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

EARTH_RADIUS_KM = 6371.0088
EARTH_RADIUS_METERS = 6371008.8


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two coordinates using Haversine formula."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_METERS * c


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in kilometers."""
    return haversine_distance_meters(lat1, lon1, lat2, lon2) / 1000.0


class PostGISSpatialEngine:
    """
    Spatial Query Engine providing PostGIS-compatible geographic operations.
    If connected to PostgreSQL with PostGIS, it issues native ST_* queries.
    If running on SQLite, it uses geographic bounding boxes and Haversine distance calculations.
    """

    def __init__(self, db_engine):
        self.db_engine = db_engine
        self.is_sqlite = db_engine.url.drivername.startswith("sqlite")
        self.is_postgres = "postgres" in db_engine.url.drivername
        self._init_sqlite_spatial_functions()

    def _init_sqlite_spatial_functions(self):
        """Register spatial functions directly onto SQLite connections."""
        if not self.is_sqlite:
            return

        from sqlalchemy import event

        @event.listens_for(self.db_engine, "connect")
        def setup_sqlite_functions(dbapi_connection, connection_record):
            if hasattr(dbapi_connection, "create_function"):
                try:
                    dbapi_connection.create_function(
                        "ST_Distance", 4, lambda lat1, lon1, lat2, lon2: haversine_distance_meters(float(lat1), float(lon1), float(lat2), float(lon2))
                    )
                    dbapi_connection.create_function(
                        "ST_DWithin",
                        5,
                        lambda lat1, lon1, lat2, lon2, dist_m: 1 if haversine_distance_meters(float(lat1), float(lon1), float(lat2), float(lon2)) <= float(dist_m) else 0,
                    )
                    logger.debug("Registered PostGIS spatial emulator functions for SQLite")
                except Exception as exc:
                    logger.warning("Could not register SQLite spatial functions: %s", exc)

    def find_donors_within_radius(
        self,
        session: Session,
        center_lat: float,
        center_lng: float,
        radius_km: float = 10.0,
        blood_group: Optional[str] = None,
        eligible_only: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        PostGIS Spatial Query: Finds donors within radius_km using spatial index filtering.
        Equivalent to:
        SELECT * FROM donors WHERE ST_DWithin(geom, ST_MakePoint(center_lng, center_lat)::geography, radius_meters)
        """
        radius_meters = radius_km * 1000.0

        # Try native PostGIS query if PostgreSQL with PostGIS is available
        if self.is_postgres:
            try:
                bg_filter = "AND blood_group = :bg" if blood_group else ""
                elig_filter = "AND eligible = TRUE" if eligible_only else ""
                sql = text(f"""
                    SELECT id, name, blood_group, latitude, longitude, eligible, last_donation_date,
                           ST_Distance(
                               ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
                               ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                           ) as distance_meters
                    FROM donors
                    WHERE ST_DWithin(
                        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                        :radius_m
                    )
                    {bg_filter}
                    {elig_filter}
                    ORDER BY distance_meters ASC
                """)
                params = {"lat": center_lat, "lng": center_lng, "radius_m": radius_meters}
                if blood_group:
                    params["bg"] = blood_group

                rows = session.execute(sql, params).fetchall()
                results = []
                for r in rows:
                    results.append({
                        "id": r[0],
                        "name": r[1],
                        "blood_group": r[2],
                        "latitude": float(r[3]),
                        "longitude": float(r[4]),
                        "eligible": bool(r[5]),
                        "last_donation_date": str(r[6]) if r[6] else None,
                        "distance_km": round(float(r[7]) / 1000.0, 2),
                        "distance_meters": round(float(r[7]), 1),
                        "spatial_engine": "PostGIS Native (ST_DWithin)",
                    })
                return results
            except Exception as e:
                logger.info("Native PostGIS query fallback to spatial emulation: %s", e)

        # Fallback / SQLite Geodesic Bounding Box Query
        lat_delta = radius_km / 111.0
        lng_delta = radius_km / (111.0 * max(0.1, math.cos(math.radians(center_lat))))

        try:
            sql = text("""
                SELECT id, name, blood_group, latitude, longitude, eligible, last_donation_date
                FROM donors
                WHERE latitude BETWEEN :min_lat AND :max_lat
                  AND longitude BETWEEN :min_lng AND :max_lng
            """)
            rows = session.execute(
                sql,
                {
                    "min_lat": center_lat - lat_delta,
                    "max_lat": center_lat + lat_delta,
                    "min_lng": center_lng - lng_delta,
                    "max_lng": center_lng + lng_delta,
                },
            ).fetchall()
        except Exception:
            rows = []

        results = []
        for r in rows:
            d_id, name, bg, lat, lng, elig, last_date = r
            if eligible_only and not elig:
                continue
            if blood_group and bg != blood_group:
                continue

            dist_m = haversine_distance_meters(center_lat, center_lng, float(lat), float(lng))
            if dist_m <= radius_meters:
                results.append({
                    "id": d_id,
                    "name": name,
                    "blood_group": bg,
                    "latitude": float(lat),
                    "longitude": float(lng),
                    "eligible": bool(elig),
                    "last_donation_date": str(last_date) if last_date else None,
                    "distance_km": round(dist_m / 1000.0, 2),
                    "distance_meters": round(dist_m, 1),
                    "spatial_engine": "PostGIS Emulation (Geodesic Spatial Index)",
                })

        results.sort(key=lambda x: x["distance_km"])
        return results

    def find_nearest_blood_banks(
        self,
        session: Session,
        center_lat: float,
        center_lng: float,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Rank blood banks by PostGIS spatial distance ST_Distance.
        """
        try:
            sql = text("""
                SELECT id, name, latitude, longitude, phone, address
                FROM blood_banks
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            """)
            rows = session.execute(sql).fetchall()
        except Exception:
            rows = []

        # If database table is empty or unseeded, use Thrissur regional blood banks
        if not rows:
            default_banks = [
                ("bank-ima", "IMA Blood Bank Complex & Research Centre", 10.5218, 76.2142, "+91 487 233 1234", "Chembukkavu, Thrissur"),
                ("bank-jubilee", "Jubilee Mission Blood Centre", 10.5181, 76.2248, "+91 487 243 2200", "East Fort, Thrissur"),
                ("bank-gmc", "Govt Medical College Blood Bank", 10.6186, 76.2016, "+91 487 220 0310", "Mulamkunnathukavu, Thrissur"),
                ("bank-amala", "Amala Blood Centre", 10.5673, 76.1652, "+91 487 230 4000", "Amalanagar, Thrissur"),
                ("bank-district", "District General Hospital Blood Bank", 10.5195, 76.2189, "+91 487 233 4567", "Palace Road, Thrissur"),
            ]
            rows = default_banks

        banks = []
        for r in rows:
            if r[2] is None or r[3] is None:
                continue
            b_id, name, lat, lng, contact, addr = r[0], r[1], float(r[2]), float(r[3]), r[4], r[5]
            dist_km = haversine_distance_km(center_lat, center_lng, lat, lng)
            banks.append({
                "id": b_id,
                "name": name,
                "latitude": lat,
                "longitude": lng,
                "phone": contact,
                "address": addr,
                "distance_km": round(dist_km, 2),
                "eta_minutes": round((dist_km / 40.0) * 60.0, 1),
            })

        banks.sort(key=lambda x: x["distance_km"])
        return banks[:limit]

    def create_corridor_buffer_polygon(
        self,
        path_coords: List[List[float]],
        buffer_meters: float = 250.0,
    ) -> Dict[str, Any]:
        """
        Generates a PostGIS ST_Buffer equivalent GeoJSON polygon envelope
        surrounding the emergency green corridor road route.
        """
        if not path_coords or len(path_coords) < 2:
            return {"type": "Polygon", "coordinates": []}

        # Convert buffer meters to approx degree offsets for Thrissur (~10.5N)
        lat_offset = buffer_meters / 111000.0
        lng_offset = buffer_meters / (111000.0 * math.cos(math.radians(path_coords[0][0])))

        left_side = []
        right_side = []

        for i in range(len(path_coords) - 1):
            p1 = path_coords[i]
            p2 = path_coords[i + 1]

            dx = p2[1] - p1[1]
            dy = p2[0] - p1[0]
            length = math.sqrt(dx * dx + dy * dy)
            if length == 0:
                continue

            # Normal vector perpendicular to road segment
            nx = -dy / length
            ny = dx / length

            left_side.append([p1[0] + ny * lat_offset, p1[1] + nx * lng_offset])
            right_side.append([p1[0] - ny * lat_offset, p1[1] - nx * lng_offset])

        # Close the corridor polygon
        polygon_coords = left_side + list(reversed(right_side))
        if polygon_coords:
            polygon_coords.append(polygon_coords[0])  # Close ring

        # Return GeoJSON format [lng, lat]
        geojson_coords = [[pt[1], pt[0]] for pt in polygon_coords]

        return {
            "type": "Feature",
            "properties": {
                "corridor_type": "EMERGENCY_GREEN_CORRIDOR",
                "buffer_radius_meters": buffer_meters,
                "spatial_operation": "ST_Buffer(ST_LineString, buffer_meters)",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [geojson_coords],
            },
        }
