Build a web application called "DistroMap".

DistroMap is a visual knowledge graph of the Linux ecosystem. The goal is to map Linux distributions and show how they are connected, starting from the Linux Kernel and branching out into different distro families.

The website should NOT have user accounts or logins. Instead, users can submit suggestions for Linux distributions. These suggestions should go through a free external API or data source that researches and collects information about the distro before adding it to the database.

The main feature is an interactive circular network graph:

- The Linux Kernel should be the central root node.
- Major Linux families should branch out from the kernel:
  - Debian
  - Arch
  - Fedora
  - Gentoo
  - Slackware
  - Others
- Smaller distributions should appear connected to their parent distributions.
- The most popular/recommended distributions should appear larger and closer to the center.
- Less popular distributions should appear smaller and further away.
- Connections should visually show the relationship between distributions.

Example:

Linux Kernel
 ├── Debian
 │    ├── Ubuntu
 │    │    ├── Linux Mint
 │    │    └── Pop!_OS
 │
 ├── Arch
 │    ├── Manjaro
 │    └── EndeavourOS
 │
 └── Fedora
      └── Nobara
      └── Bazzite

Each distro node should display information such as:
- Name
- Description
- Based on
- Package manager
- Release model
- Desktop environments
- Popularity score
- Official website
- Logo

Recommended technology stack:

Frontend:
- React + TypeScript
- Vite
- Tailwind CSS
- React Flow or D3.js for the interactive graph

Backend:
- Python FastAPI

Database:
- PostgreSQL

Data sources:
- Wikidata API for distro relationships
- Other free Linux metadata APIs where available
- google favicon database 

The first version should focus on:
1. Creating the interactive Linux distribution graph
2. Loading distro data from JSON/database
3. Showing connections between distributions
4. Adding a search feature
5. Adding a distro suggestion system
6. add in code to display a favicon from that distro website if no relavent img just use first letter

The design should feel modern and technical, inspired by Linux, with a dark theme, clean UI, and smooth animations.