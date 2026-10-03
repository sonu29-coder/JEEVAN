"""
HEMO-GRID AI - GIS Routing Engine
Modular graph-based routing with Dijkstra and A* (A-Star) search algorithms.
Optimized for Thrissur medical grid: Blood Banks, Donors, and ICU Hospitals.
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple


class RouteType(str, Enum):
    STANDARD = "STANDARD"
    GREEN_CORRIDOR = "GREEN_CORRIDOR"


# Earth radius in kilometers for Haversine calculations
EARTH_RADIUS_KM = 6371.0088


def haversine_distance(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
    """
    Calculate the great circle distance in kilometers between two points
    on the Earth using the Haversine formula.
    coord = (latitude, longitude)
    """
    lat1, lon1 = coord1
    lat2, lon2 = coord2
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * math.asin(math.sqrt(max(0.0, min(1.0, a))))
    return EARTH_RADIUS_KM * c


def calculate_bearing(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
    """Calculate the forward compass bearing between two points in degrees (0-360)."""
    lat1, lon1 = math.radians(coord1[0]), math.radians(coord1[1])
    lat2, lon2 = math.radians(coord2[0]), math.radians(coord2[1])
    d_lon = lon2 - lon1
    x = math.sin(d_lon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    initial_bearing = math.atan2(x, y)
    compass_bearing = (math.degrees(initial_bearing) + 360.0) % 360.0
    return compass_bearing


def turn_direction(bearing1: float, bearing2: float) -> str:
    """Determine turn instruction based on change in bearing."""
    diff = (bearing2 - bearing1 + 180.0) % 360.0 - 180.0
    if -20 <= diff <= 20:
        return "Continue straight onto"
    elif 20 < diff <= 60:
        return "Bear slightly right onto"
    elif 60 < diff <= 135:
        return "Turn right onto"
    elif diff > 135:
        return "Make a sharp right onto"
    elif -60 <= diff < -20:
        return "Bear slightly left onto"
    elif -135 <= diff < -60:
        return "Turn left onto"
    else:
        return "Make a sharp left onto"


@dataclass
class Node:
    id: str
    name: str
    lat: float
    lng: float
    node_type: str  # 'icu', 'bank', 'donor', 'junction'

    @property
    def coordinates(self) -> Tuple[float, float]:
        return (self.lat, self.lng)


@dataclass
class Edge:
    target: str
    distance_km: float
    base_speed_kmh: float = 40.0
    traffic_factor: float = 1.0  # 1.0 = clear, >1.0 = congestion slowdown
    signals_count: int = 1
    road_name: str = "Transit Road"

    def transit_time_mins(self, route_type: RouteType) -> float:
        """
        Calculate travel time across this edge in minutes.
        - STANDARD: applies normal traffic multiplier and traffic light signal delay.
        - GREEN_CORRIDOR: emergency green light priority (0 signal wait) + emergency speed clearance.
        """
        if route_type == RouteType.GREEN_CORRIDOR:
            # Green corridor: emergency priority, traffic signals set to green, 0 delay, 1.25x speed
            effective_speed = min(80.0, self.base_speed_kmh * 1.3)
            travel_time = (self.distance_km / effective_speed) * 60.0
            return max(0.2, travel_time)
        else:
            # Standard route: subject to traffic congestion and signal wait (avg 0.75 min / signal)
            effective_speed = max(15.0, self.base_speed_kmh / max(0.5, self.traffic_factor))
            travel_time = (self.distance_km / effective_speed) * 60.0
            signal_delay = self.signals_count * 0.75
            return max(0.3, travel_time + signal_delay)


class RoadGraph:
    """
    Weighted directed road graph representing the Thrissur GIS network
    connecting ICUs, Blood Banks, Donors, and key arterial road intersections.
    """

    def __init__(self):
        self.nodes: Dict[str, Node] = {}
        self.adjacency: Dict[str, List[Edge]] = {}

    def add_node(self, node: Node) -> None:
        self.nodes[node.id] = node
        if node.id not in self.adjacency:
            self.adjacency[node.id] = []

    def add_edge(
        self,
        u: str,
        v: str,
        distance_km: float,
        base_speed_kmh: float = 40.0,
        traffic_factor: float = 1.0,
        signals_count: int = 1,
        road_name: str = "Transit Road",
        bidirectional: bool = True,
    ) -> None:
        self.adjacency[u].append(
            Edge(
                target=v,
                distance_km=distance_km,
                base_speed_kmh=base_speed_kmh,
                traffic_factor=traffic_factor,
                signals_count=signals_count,
                road_name=road_name,
            )
        )
        if bidirectional:
            self.adjacency[v].append(
                Edge(
                    target=u,
                    distance_km=distance_km,
                    base_speed_kmh=base_speed_kmh,
                    traffic_factor=traffic_factor,
                    signals_count=signals_count,
                    road_name=road_name,
                )
            )

    def find_nearest_node(self, lat: float, lng: float) -> str:
        """Find the closest graph node to a given coordinate."""
        closest_id = ""
        min_dist = float("inf")
        target_coord = (lat, lng)
        for node_id, node in self.nodes.items():
            dist = haversine_distance(target_coord, node.coordinates)
            if dist < min_dist:
                min_dist = dist
                closest_id = node_id
        return closest_id

    def dijkstra(self, start_id: str, goal_id: str) -> Tuple[List[str], float, float]:
        """
        Dijkstra's Algorithm for calculating standard shortest transit times
        between nodes based on distance and traffic weights.
        Returns: (path_node_ids, total_distance_km, total_time_mins)
        """
        if start_id not in self.nodes or goal_id not in self.nodes:
            raise ValueError(f"Nodes {start_id} or {goal_id} not found in graph")

        if start_id == goal_id:
            return [start_id], 0.0, 0.0

        pq: List[Tuple[float, str]] = [(0.0, start_id)]
        distances: Dict[str, float] = {start_id: 0.0}
        prev_node: Dict[str, Optional[str]] = {start_id: None}
        prev_edge: Dict[str, Optional[Edge]] = {start_id: None}

        while pq:
            curr_dist, u = heapq.heappop(pq)
            if curr_dist > distances[u]:
                continue
            if u == goal_id:
                break

            for edge in self.adjacency.get(u, []):
                v = edge.target
                weight = edge.transit_time_mins(RouteType.STANDARD)
                if distances.get(v, float("inf")) > curr_dist + weight:
                    distances[v] = curr_dist + weight
                    prev_node[v] = u
                    prev_edge[v] = edge
                    heapq.heappush(pq, (distances[v], v))

        if goal_id not in prev_node:
            raise ValueError(f"No path found between {start_id} and {goal_id}")

        # Reconstruct path
        path = []
        curr = goal_id
        while curr is not None:
            path.append(curr)
            curr = prev_node[curr]
        path.reverse()

        # Compute total distance and total transit time
        total_distance_km = 0.0
        total_time_mins = 0.0
        for i in range(len(path) - 1):
            u_id, v_id = path[i], path[i + 1]
            for edge in self.adjacency[u_id]:
                if edge.target == v_id:
                    total_distance_km += edge.distance_km
                    total_time_mins += edge.transit_time_mins(RouteType.STANDARD)
                    break

        return path, round(total_distance_km, 2), round(total_time_mins, 1)

    def a_star(self, start_id: str, goal_id: str) -> Tuple[List[str], float, float]:
        """
        A* (A-Star) Search Algorithm using Haversine distance as heuristic h(n)
        for high-priority 'Green Corridor' emergency dispatches.
        Admissible & consistent heuristic: straight-line distance / max corridor speed (80 km/h).
        Returns: (path_node_ids, total_distance_km, total_time_mins)
        """
        if start_id not in self.nodes or goal_id not in self.nodes:
            raise ValueError(f"Nodes {start_id} or {goal_id} not found in graph")

        if start_id == goal_id:
            return [start_id], 0.0, 0.0

        goal_node = self.nodes[goal_id]
        max_speed_kmh = 80.0  # Max emergency vehicle clearance speed

        def heuristic(node_id: str) -> float:
            node = self.nodes[node_id]
            dist_km = haversine_distance(node.coordinates, goal_node.coordinates)
            # h(n) in minutes: admissible lower bound on transit time to goal
            return (dist_km / max_speed_kmh) * 60.0

        # Priority queue stores: (f_score, g_score, node_id)
        pq: List[Tuple[float, float, str]] = [(heuristic(start_id), 0.0, start_id)]
        g_scores: Dict[str, float] = {start_id: 0.0}
        prev_node: Dict[str, Optional[str]] = {start_id: None}
        visited: set[str] = set()

        while pq:
            f, g, u = heapq.heappop(pq)
            if u in visited:
                continue
            visited.add(u)

            if u == goal_id:
                break

            for edge in self.adjacency.get(u, []):
                v = edge.target
                weight = edge.transit_time_mins(RouteType.GREEN_CORRIDOR)
                tentative_g = g + weight

                if tentative_g < g_scores.get(v, float("inf")):
                    g_scores[v] = tentative_g
                    prev_node[v] = u
                    f_score = tentative_g + heuristic(v)
                    heapq.heappush(pq, (f_score, tentative_g, v))

        if goal_id not in prev_node:
            raise ValueError(f"No path found between {start_id} and {goal_id}")

        # Reconstruct path
        path = []
        curr = goal_id
        while curr is not None:
            path.append(curr)
            curr = prev_node[curr]
        path.reverse()

        total_distance_km = 0.0
        total_time_mins = 0.0
        for i in range(len(path) - 1):
            u_id, v_id = path[i], path[i + 1]
            for edge in self.adjacency[u_id]:
                if edge.target == v_id:
                    total_distance_km += edge.distance_km
                    total_time_mins += edge.transit_time_mins(RouteType.GREEN_CORRIDOR)
                    break

        return path, round(total_distance_km, 2), round(total_time_mins, 1)


def build_default_thrissur_graph() -> RoadGraph:
    """
    Build the default Thrissur medical GIS road network connecting
    ICUs, Blood Banks, Donors, and road junctions.
    """
    g = RoadGraph()

    # 1. ICUs (from frontend/lib/hemo-data.ts)
    g.add_node(Node("icu-elite", "Elite Mission Hospital", 10.5089, 76.2052, "icu"))
    g.add_node(Node("icu-westfort", "West Fort Hospital", 10.5268, 76.1993, "icu"))
    g.add_node(Node("icu-daya", "Daya General Hospital", 10.5376, 76.1764, "icu"))
    g.add_node(Node("icu-jubilee", "Jubilee Mission Hospital", 10.5149, 76.2291, "icu"))

    # 2. Blood Banks (from frontend/lib/hemo-data.ts)
    g.add_node(Node("bank-gmc", "Govt Medical College Blood Bank", 10.6186, 76.2016, "bank"))
    g.add_node(Node("bank-jubilee", "Jubilee Mission Blood Centre", 10.5181, 76.2248, "bank"))
    g.add_node(Node("bank-ima", "IMA Blood Bank Thrissur", 10.5262, 76.2138, "bank"))
    g.add_node(Node("bank-amala", "Amala Blood Centre", 10.5673, 76.1652, "bank"))
    g.add_node(Node("bank-district", "District Hospital Blood Bank", 10.5195, 76.2189, "bank"))

    # 3. Donors (from frontend/lib/hemo-data.ts)
    g.add_node(Node("d1", "Aarav (Donor 1 - O-)", 10.5402, 76.2311, "donor"))
    g.add_node(Node("d2", "Sneha (Donor 2 - O-)", 10.4961, 76.2262, "donor"))
    g.add_node(Node("d3", "Rahul (Donor 3 - B+)", 10.5531, 76.2042, "donor"))
    g.add_node(Node("d4", "Diya (Donor 4 - B+)", 10.5092, 76.1826, "donor"))

    # 4. Key Arterial Junctions
    g.add_node(Node("junc-swaraj-round", "Swaraj Round", 10.5276, 76.2144, "junction"))
    g.add_node(Node("junc-east-fort", "East Fort Junction", 10.5230, 76.2235, "junction"))
    g.add_node(Node("junc-west-fort", "West Fort Junction", 10.5255, 76.2010, "junction"))
    g.add_node(Node("junc-north-bus", "North Bus Stand Junction", 10.5320, 76.2150, "junction"))
    g.add_node(Node("junc-south-bus", "South Bus Stand Junction", 10.5215, 76.2135, "junction"))
    g.add_node(Node("junc-punkunnam", "Punkunnam Junction", 10.5420, 76.2025, "junction"))
    g.add_node(Node("junc-amala", "Amala Nagar Junction", 10.5650, 76.1680, "junction"))
    g.add_node(Node("junc-medical-college", "Mulamkunnathukavu Junction", 10.6120, 76.2030, "junction"))
    g.add_node(Node("junc-kuriachira", "Kuriachira Junction", 10.5050, 76.2180, "junction"))
    g.add_node(Node("junc-mannuthy", "Mannuthy Bypass", 10.5300, 76.2600, "junction"))
    g.add_node(Node("junc-koorkenchery", "Koorkenchery Junction", 10.5070, 76.2110, "junction"))

    # 5. Edges with realistic distances, speeds, traffic factors, and signals
    # Swaraj Round Core Connections
    g.add_edge("bank-ima", "junc-swaraj-round", distance_km=0.25, base_speed_kmh=35.0, traffic_factor=1.2, signals_count=1, road_name="Round West")
    g.add_edge("junc-swaraj-round", "junc-north-bus", distance_km=0.6, base_speed_kmh=40.0, traffic_factor=1.3, signals_count=1, road_name="Round North")
    g.add_edge("junc-swaraj-round", "junc-south-bus", distance_km=0.7, base_speed_kmh=40.0, traffic_factor=1.2, signals_count=1, road_name="Round South")
    g.add_edge("junc-swaraj-round", "junc-east-fort", distance_km=1.2, base_speed_kmh=45.0, traffic_factor=1.4, signals_count=2, road_name="High Road")
    g.add_edge("junc-swaraj-round", "junc-west-fort", distance_km=1.5, base_speed_kmh=45.0, traffic_factor=1.3, signals_count=2, road_name="MG Road")

    # East Fort & Jubilee Hub
    g.add_edge("junc-east-fort", "bank-district", distance_km=0.6, base_speed_kmh=40.0, traffic_factor=1.1, signals_count=1, road_name="District Hospital Road")
    g.add_edge("junc-east-fort", "bank-jubilee", distance_km=0.7, base_speed_kmh=40.0, traffic_factor=1.2, signals_count=1, road_name="Jubilee Station Road")
    g.add_edge("bank-jubilee", "icu-jubilee", distance_km=0.6, base_speed_kmh=35.0, traffic_factor=1.1, signals_count=0, road_name="Jubilee Campus Link")
    g.add_edge("junc-east-fort", "icu-jubilee", distance_km=1.1, base_speed_kmh=40.0, traffic_factor=1.2, signals_count=1, road_name="East Fort - Jubilee Link")
    g.add_edge("junc-east-fort", "junc-mannuthy", distance_km=4.2, base_speed_kmh=55.0, traffic_factor=1.1, signals_count=2, road_name="Palakkad Highway")

    # West Fort & Daya Hub
    g.add_edge("junc-west-fort", "icu-westfort", distance_km=0.2, base_speed_kmh=30.0, traffic_factor=1.0, signals_count=0, road_name="West Fort Approach")
    g.add_edge("junc-west-fort", "icu-daya", distance_km=3.1, base_speed_kmh=50.0, traffic_factor=1.2, signals_count=2, road_name="Kanjany Road")
    g.add_edge("junc-west-fort", "junc-punkunnam", distance_km=1.9, base_speed_kmh=45.0, traffic_factor=1.2, signals_count=1, road_name="Poothole - Punkunnam Link")

    # South Bus Stand, Koorkenchery & Elite Mission
    g.add_edge("junc-south-bus", "junc-koorkenchery", distance_km=1.8, base_speed_kmh=45.0, traffic_factor=1.2, signals_count=1, road_name="Kodungallur Road")
    g.add_edge("junc-koorkenchery", "icu-elite", distance_km=0.7, base_speed_kmh=40.0, traffic_factor=1.1, signals_count=1, road_name="Elite Hospital Link")
    g.add_edge("junc-koorkenchery", "junc-kuriachira", distance_km=0.9, base_speed_kmh=45.0, traffic_factor=1.1, signals_count=1, road_name="NH Bye-pass Connection")
    g.add_edge("junc-kuriachira", "icu-elite", distance_km=1.5, base_speed_kmh=45.0, traffic_factor=1.1, signals_count=1, road_name="Kuriachira - Elite Way")
    g.add_edge("junc-kuriachira", "junc-east-fort", distance_km=2.2, base_speed_kmh=45.0, traffic_factor=1.3, signals_count=2, road_name="Ollur - East Fort Road")

    # North Corridor: Punkunnam, Amala & Govt Medical College
    g.add_edge("junc-north-bus", "junc-punkunnam", distance_km=1.7, base_speed_kmh=45.0, traffic_factor=1.3, signals_count=2, road_name="Shornur Road")
    g.add_edge("junc-punkunnam", "junc-amala", distance_km=4.6, base_speed_kmh=55.0, traffic_factor=1.1, signals_count=2, road_name="Kunnamkulam Arterial Road")
    g.add_edge("junc-amala", "bank-amala", distance_km=0.5, base_speed_kmh=35.0, traffic_factor=1.0, signals_count=0, road_name="Amala Campus Road")
    g.add_edge("junc-amala", "icu-daya", distance_km=3.3, base_speed_kmh=50.0, traffic_factor=1.1, signals_count=1, road_name="Sobha City Bypass")
    g.add_edge("junc-punkunnam", "junc-medical-college", distance_km=7.9, base_speed_kmh=60.0, traffic_factor=1.1, signals_count=3, road_name="Medical College Highway")
    g.add_edge("junc-medical-college", "bank-gmc", distance_km=0.8, base_speed_kmh=40.0, traffic_factor=1.0, signals_count=1, road_name="GMC Campus Approach")

    # Donor Links to Nearest Road Network Nodes
    g.add_edge("d1", "junc-mannuthy", distance_km=3.2, base_speed_kmh=45.0, traffic_factor=1.0, signals_count=1, road_name="Mannuthy Local Link")
    g.add_edge("d1", "junc-east-fort", distance_km=2.4, base_speed_kmh=40.0, traffic_factor=1.1, signals_count=1, road_name="East Link")
    g.add_edge("d2", "junc-kuriachira", distance_km=1.4, base_speed_kmh=40.0, traffic_factor=1.0, signals_count=1, road_name="South Residential Link")
    g.add_edge("d3", "junc-punkunnam", distance_km=1.3, base_speed_kmh=40.0, traffic_factor=1.0, signals_count=1, road_name="Punkunnam North Link")
    g.add_edge("d4", "icu-elite", distance_km=2.3, base_speed_kmh=45.0, traffic_factor=1.0, signals_count=1, road_name="West Suburban Road")
    g.add_edge("d4", "junc-koorkenchery", distance_km=3.1, base_speed_kmh=45.0, traffic_factor=1.1, signals_count=1, road_name="Koorkenchery Link")

    return g


# Global graph instance
GRAPH = build_default_thrissur_graph()


def generate_turn_by_turn(
    graph: RoadGraph, path_ids: List[str], route_type: RouteType
) -> List[Dict[str, Any]]:
    """
    Generate rich turn-by-turn navigation instructions, segment distances,
    and cumulative ETAs along the optimal path.
    """
    if not path_ids:
        return []

    steps: List[Dict[str, Any]] = []
    cumulative_km = 0.0
    cumulative_mins = 0.0

    # Start node
    start_node = graph.nodes[path_ids[0]]
    steps.append({
        "node_id": start_node.id,
        "name": start_node.name,
        "instruction": f"Depart from {start_node.name}",
        "road_name": "Origin",
        "distance_km": 0.0,
        "segment_km": 0.0,
        "eta_mins": 0.0,
        "coordinates": [start_node.lat, start_node.lng],
    })

    if len(path_ids) == 1:
        return steps

    prev_bearing: Optional[float] = None

    for i in range(len(path_ids) - 1):
        u_id = path_ids[i]
        v_id = path_ids[i + 1]
        u_node = graph.nodes[u_id]
        v_node = graph.nodes[v_id]

        # Find edge
        edge_match = None
        for edge in graph.adjacency.get(u_id, []):
            if edge.target == v_id:
                edge_match = edge
                break

        seg_dist = edge_match.distance_km if edge_match else haversine_distance(u_node.coordinates, v_node.coordinates)
        seg_time = edge_match.transit_time_mins(route_type) if edge_match else (seg_dist / 40.0) * 60.0
        road = edge_match.road_name if edge_match else "Connected Road"

        cumulative_km += seg_dist
        cumulative_mins += seg_time

        bearing = calculate_bearing(u_node.coordinates, v_node.coordinates)

        if i == len(path_ids) - 2:
            # Arrival at final destination
            instruction = f"Arrive at destination: {v_node.name}"
        elif prev_bearing is None:
            instruction = f"Head towards {v_node.name} on {road}"
        else:
            turn_text = turn_direction(prev_bearing, bearing)
            instruction = f"{turn_text} {road} towards {v_node.name}"

        prev_bearing = bearing

        steps.append({
            "node_id": v_node.id,
            "name": v_node.name,
            "instruction": instruction,
            "road_name": road,
            "distance_km": round(cumulative_km, 2),
            "segment_km": round(seg_dist, 2),
            "eta_mins": round(cumulative_mins, 1),
            "coordinates": [v_node.lat, v_node.lng],
        })

    return steps


def optimize_route(
    origin: str | Tuple[float, float],
    destination: str | Tuple[float, float],
    route_type: RouteType = RouteType.STANDARD,
) -> Dict[str, Any]:
    """
    High-level entry point to calculate the optimal route between two points.
    - If origin/destination are node IDs (e.g. 'bank-ima', 'icu-elite'), uses them.
    - If coordinates, snaps to nearest graph nodes.
    - Uses Dijkstra for STANDARD transit routing.
    - Uses A* with Haversine heuristic for GREEN_CORRIDOR emergency routing.
    """
    # Resolve origin node
    if isinstance(origin, str) and origin in GRAPH.nodes:
        start_id = origin
    elif isinstance(origin, (tuple, list)) and len(origin) == 2:
        start_id = GRAPH.find_nearest_node(float(origin[0]), float(origin[1]))
    else:
        raise ValueError(f"Invalid origin: {origin}")

    # Resolve destination node
    if isinstance(destination, str) and destination in GRAPH.nodes:
        goal_id = destination
    elif isinstance(destination, (tuple, list)) and len(destination) == 2:
        goal_id = GRAPH.find_nearest_node(float(destination[0]), float(destination[1]))
    else:
        raise ValueError(f"Invalid destination: {destination}")

    # Run selected algorithm
    if route_type == RouteType.GREEN_CORRIDOR:
        path_ids, dist_km, eta_mins = GRAPH.a_star(start_id, goal_id)
    else:
        path_ids, dist_km, eta_mins = GRAPH.dijkstra(start_id, goal_id)

    # Build coordinates path array [[lat, lng], ...]
    path_coords = [[GRAPH.nodes[nid].lat, GRAPH.nodes[nid].lng] for nid in path_ids]

    # Generate turn-by-turn guidance
    turn_steps = generate_turn_by_turn(GRAPH, path_ids, route_type)

    return {
        "route_type": route_type.value,
        "algorithm": "A*" if route_type == RouteType.GREEN_CORRIDOR else "Dijkstra",
        "origin_id": start_id,
        "destination_id": goal_id,
        "total_distance_km": dist_km,
        "distance_km": dist_km,
        "eta_minutes": eta_mins,
        "eta_mins": eta_mins,
        "path": path_coords,
        "node_ids": path_ids,
        "turn_by_turn": turn_steps,
        "green_corridor_active": route_type == RouteType.GREEN_CORRIDOR,
    }
