"""
HEMO-GRID AI - GIS Routing Engine
Modular graph-based routing with Dijkstra and A* (A-Star) search algorithms.
Optimized for Chennai medical grid: Blood Banks, Donors, and ICU Hospitals.
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
    Weighted directed road graph representing the Chennai GIS network
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


def build_default_chennai_graph() -> RoadGraph:
    """
    Constructs the standard arterial road network graph for Chennai medical corridor.
    Includes major ICUs, Blood Banks, Donors, and key intersections along
    Anna Salai, Poonamallee High Road, Inner Ring Road, and OMR.
    """
    g = RoadGraph()

    # 1. ICUs (Chennai Synthetic Hubs)
    g.add_node(Node("icu-elite", "Kilpauk Medical & Critical Care [SYNTHETIC DEMO]", 13.0784, 80.2415, "icu"))
    g.add_node(Node("icu-westfort", "Anna Nagar Multispecialty Hospital [SYNTHETIC DEMO]", 13.0850, 80.2101, "icu"))
    g.add_node(Node("icu-daya", "Porur Surgical Institute [SYNTHETIC DEMO]", 13.0382, 80.1565, "icu"))
    g.add_node(Node("icu-jubilee", "Apollo-Greams Corridor Care [SYNTHETIC DEMO]", 13.0610, 80.2510, "icu"))

    # 2. Blood Banks (Chennai Synthetic Hubs)
    g.add_node(Node("bank-gmc", "Madras Govt Medical College Blood Centre [SYNTHETIC DEMO]", 13.0833, 80.2783, "bank"))
    g.add_node(Node("bank-jubilee", "Mylapore Community Blood Centre [SYNTHETIC DEMO]", 13.0368, 80.2676, "bank"))
    g.add_node(Node("bank-ima", "Red Cross Blood Centre Chennai [SYNTHETIC DEMO]", 13.0680, 80.2480, "bank"))
    g.add_node(Node("bank-amala", "Ambattur Regional Blood Bank [SYNTHETIC DEMO]", 13.1143, 80.1548, "bank"))
    g.add_node(Node("bank-district", "Guindy Apex Blood Bank [SYNTHETIC DEMO]", 13.0067, 80.2025, "bank"))

    # 3. Donors (Chennai Locations)
    g.add_node(Node("d1", "Aarav (Donor 1 - O-)", 13.0569, 80.2425, "donor"))
    g.add_node(Node("d2", "Sneha (Donor 2 - O-)", 13.0418, 80.2341, "donor"))
    g.add_node(Node("d3", "Rahul (Donor 3 - B+)", 13.0850, 80.2101, "donor"))
    g.add_node(Node("d4", "Diya (Donor 4 - B+)", 13.0382, 80.1565, "donor"))

    # 4. Key Arterial Junctions across Chennai
    g.add_node(Node("junc-gemini", "Gemini Flyover / Anna Salai", 13.0528, 80.2508, "junction"))
    g.add_node(Node("junc-kathipara", "Kathipara Grade Separator", 13.0067, 80.2025, "junction"))
    g.add_node(Node("junc-madhya-kailash", "Madhya Kailash Junction / OMR", 13.0062, 80.2520, "junction"))
    g.add_node(Node("junc-t-nagar", "T. Nagar Panagal Park", 13.0418, 80.2341, "junction"))
    g.add_node(Node("junc-anna-arch", "Anna Arch Junction", 13.0850, 80.2101, "junction"))
    g.add_node(Node("junc-koyambedu", "Koyambedu Roundabout", 13.0694, 80.1948, "junction"))
    g.add_node(Node("junc-kilpauk", "Kilpauk Garden Junction", 13.0784, 80.2415, "junction"))
    g.add_node(Node("junc-central", "Chennai Central / EVR Salai", 13.0827, 80.2707, "junction"))
    g.add_node(Node("junc-guindy", "Guindy Race Course Link", 13.0100, 80.2120, "junction"))
    g.add_node(Node("junc-porur", "Porur Tollgate Junction", 13.0382, 80.1565, "junction"))

    # 5. Edges with realistic distances, speeds, traffic factors, and road names
    # Central & Kilpauk Corridor
    g.add_edge("bank-gmc", "junc-central", distance_km=1.2, base_speed_kmh=35.0, traffic_factor=1.2, signals_count=1, road_name="EVR Periyar Salai")
    g.add_edge("junc-central", "bank-ima", distance_km=2.8, base_speed_kmh=40.0, traffic_factor=1.3, signals_count=2, road_name="Poonamallee High Road")
    g.add_edge("bank-ima", "junc-kilpauk", distance_km=1.4, base_speed_kmh=40.0, traffic_factor=1.1, signals_count=1, road_name="Kilpauk Garden Road")
    g.add_edge("junc-kilpauk", "icu-elite", distance_km=0.4, base_speed_kmh=30.0, traffic_factor=1.0, signals_count=0, road_name="Kilpauk Medical Access")
    g.add_edge("junc-kilpauk", "junc-anna-arch", distance_km=3.2, base_speed_kmh=45.0, traffic_factor=1.2, signals_count=2, road_name="New Avadi Road")

    # Anna Nagar & Koyambedu Corridor
    g.add_edge("junc-anna-arch", "icu-westfort", distance_km=0.5, base_speed_kmh=35.0, traffic_factor=1.0, signals_count=1, road_name="2nd Avenue Anna Nagar")
    g.add_edge("junc-anna-arch", "junc-koyambedu", distance_km=2.4, base_speed_kmh=45.0, traffic_factor=1.3, signals_count=2, road_name="100 Feet Road")
    g.add_edge("junc-koyambedu", "junc-porur", distance_km=5.6, base_speed_kmh=50.0, traffic_factor=1.2, signals_count=2, road_name="Poonamallee Bypass")
    g.add_edge("junc-porur", "icu-daya", distance_km=0.6, base_speed_kmh=35.0, traffic_factor=1.0, signals_count=0, road_name="Mount-Poonamallee Road")

    # Gemini & Central Spine Corridor
    g.add_edge("bank-ima", "junc-gemini", distance_km=2.1, base_speed_kmh=40.0, traffic_factor=1.2, signals_count=1, road_name="Anna Salai (Mount Road)")
    g.add_edge("junc-gemini", "icu-jubilee", distance_km=0.9, base_speed_kmh=35.0, traffic_factor=1.1, signals_count=1, road_name="Greams Road")
    g.add_edge("junc-gemini", "junc-t-nagar", distance_km=1.8, base_speed_kmh=40.0, traffic_factor=1.3, signals_count=2, road_name="G.N. Chetty Road")
    g.add_edge("junc-t-nagar", "junc-kathipara", distance_km=4.8, base_speed_kmh=50.0, traffic_factor=1.2, signals_count=2, road_name="Anna Salai Expressway")

    # South Corridor: Guindy, Kathipara & Mylapore
    g.add_edge("junc-kathipara", "bank-district", distance_km=0.5, base_speed_kmh=35.0, traffic_factor=1.0, signals_count=1, road_name="Guindy Industrial Estate Link")
    g.add_edge("junc-kathipara", "junc-guindy", distance_km=1.2, base_speed_kmh=45.0, traffic_factor=1.1, signals_count=1, road_name="GST Road")
    g.add_edge("junc-guindy", "junc-madhya-kailash", distance_km=4.6, base_speed_kmh=50.0, traffic_factor=1.2, signals_count=2, road_name="Sardar Patel Road")
    g.add_edge("junc-madhya-kailash", "bank-jubilee", distance_km=3.8, base_speed_kmh=45.0, traffic_factor=1.2, signals_count=2, road_name="Kamarajar Salai / Mylapore Link")

    # Ambattur North-West Link
    g.add_edge("junc-anna-arch", "bank-amala", distance_km=6.8, base_speed_kmh=55.0, traffic_factor=1.1, signals_count=2, road_name="Ambattur Industrial Arterial")

    # Donor Links to Nearest Nodes
    g.add_edge("d1", "junc-gemini", distance_km=1.5, base_speed_kmh=40.0, traffic_factor=1.0, signals_count=1, road_name="Nungambakkam High Road")
    g.add_edge("d2", "junc-t-nagar", distance_km=0.7, base_speed_kmh=35.0, traffic_factor=1.1, signals_count=1, road_name="Thyagaraya Road")
    g.add_edge("d3", "junc-anna-arch", distance_km=0.8, base_speed_kmh=35.0, traffic_factor=1.0, signals_count=1, road_name="Anna Nagar East Access")
    g.add_edge("d4", "junc-porur", distance_km=0.9, base_speed_kmh=35.0, traffic_factor=1.0, signals_count=1, road_name="Porur Residential Link")

    return g


# Compatibility alias so existing tests and callers resolve seamlessly
build_default_thrissur_graph = build_default_chennai_graph

# Global graph instance
GRAPH = build_default_chennai_graph()



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
