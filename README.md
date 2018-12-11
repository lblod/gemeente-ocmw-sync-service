# gemeente ocmw sync service

Sometimes it's required to be able to refer to local decisions and structured data in those decisions before they have been published. To support this use case this service provides a temporary sync between two different administrative units that belong to the same area.

## Assumptions
- we assume only one document needs to be synced at a given time
- there is one shared graph where data from the source document is written to
- the shared graph is readable by the linked ocmw
- data is only synced from gemeente to ocmw
