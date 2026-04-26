# Meeseeks Concept

This is an ideation document for a locally-hosted web app that coordinates human and agentic collaboration on tasks through the stages of a development process. A human operator uses the web interface to manage work, while agents run as agentic console instances that the interface can spawn, monitor, and interact with.

## Projects, Tracks, and Lanes

A Project is a `project.meeseeks` configuration file that lists Track locations. It is the unit the UI opens — analogous to opening a project in a desktop application. By default, new users create a project folder and add Tracks as subfolders within it via the UI. Advanced users can register Tracks from arbitrary filesystem locations by editing the project config directly.

Tracks live alongside the folders they operate on (e.g. a git repo) rather than containing them. A Track is a folder. Lanes are subfolders within a Track, and process states are subfolders within a Lane. A Lane encapsulates a process for work units (tickets) to progress through the stages of development.

 Each Lane has a distinct PROCESS.md file that serves as an instruction document for agents operating within that Lane — defining stages, transition rules, and any Lane-specific conventions. For example, a 'grooming' action might transition a ticket from Backlog to Ready. PROCESS.md files may differ between Lanes and evolve over time as the process is refined; changes are expected to be infrequent and deliberate. Agent instances are intended to be short-lived, so mid-flight inconsistency from a PROCESS.md change is not a significant concern. When a user creates a new Lane, the app should offer a sensible default PROCESS.md as a starting point, possibly with sample templates for common workflows.

Skills, MCP servers, and other contextual configurations of agents will be scoped to Tracks. Each agent is rooted in a Track and acts within a Lane. Git repositories are the typical — but not required — locations where agents perform work to address tickets; they are targets of agent action, not part of the ticket storage model. Ideally agents are chroot'd in a Track so they can more safely have YOLO permissions within the Track.

## Storage Models
Data models in Meeseeks are primarily markdown files in folder structures. A ticket is a markdown file, possibly with frontmatter, whose location in the folder hierarchy encodes its state — it lives in the process state subfolder of its Lane. Moving a ticket between states is literally moving the file between state folders.

At the Track level (shared by Lanes within the Track) is a [markdown wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) of domain knowledge (memory) that is updated continuously by agents as they progress. Wiki consistency is maintained by serializing updates: agents produce normalized artifacts, which are ingested sequentially into the wiki rather than written concurrently.

Additional storage done through skills or plugins configured at the Track level. 

## Synchronization

This ticket system can synchronize with traditional ticket systems with optionally configured agentic operations. Synchronization is a post-core feature; the specifics of conflict resolution and sync cadence will be defined once the core feature set is stable. Tracks may require periodic job scheduling to support regular iterations of sync tasks.

## Notifications

Notifications are a core value of Meeseeks. The resource this app exists to optimize is human attention. The app must support a browsable queue of notificans as well as highlighting or decorating UI elements where relevant.

Notable notifications include but are not limited to: agents waiting for human input, issues that have new or updated comment threads, or alert sources that lead to new incident issues being created.
