import { Link } from "./link.interface";
import { Node } from "./node.interface";

export interface Graph {
    nodes: Node[],
    links: Link[]
}