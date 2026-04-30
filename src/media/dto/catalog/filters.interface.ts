import { FilterType } from "./filter-type.enum";
import { Operation } from "./operation.enum";
import { Job } from "src/credit/dto/job.enum";

export interface FILTERS {
    id: number,
    typeData: FilterType | Job,
    operation: Operation,
    value: {
        value: string | number
    }[]
}