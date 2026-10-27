import osmnx as ox
G = ox.graph_from_place("Chennai, Tamil Nadu,India", network_type="drive")
G = ox.add_edge_speeds(G)
G = ox.add_edge_travel_times(G)
ox.save_graphml(G, "chennai_graph.graphml")