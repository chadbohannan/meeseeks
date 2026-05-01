The `.claude/` directory is the operational "control center" for Claude Code, Anthropic's agentic CLI tool. It acts as a communication protocol that bridges your local codebase with Claude's model, storing instructions, state, and permissions to ensure consistency across sessions.   

**Core Directory Structure**  
Claude Code recognizes specific subdirectories within `.claude/` to modularize how it handles different types of data: 

* `CLAUDE.md`: The primary "instruction manual." Claude reads this at the start of every session. While it can live in the project root, placing it at `.claude/CLAUDE.md` is a common way to keep the root clean.  
* `rules/`: Stores focused markdown files for specific standards (e.g., `testing.md`, `style.md`). Claude treats these as high-priority instructions, and they can be scoped to specific file paths using YAML frontmatter.  
* `commands/`: Contains markdown files that define custom slash commands. Each filename becomes a command (e.g., `review.md` creates `/project:review`).  
* `skills/`: Houses self-contained "toolkits" for complex, multi-step workflows. Unlike single-file commands, skills can bundle supporting scripts and references.  
* `settings.json`: Manages operational control, such as tool permission allowlists (e.g., allowing `npm run test` without prompting) and sandboxing rules.  
* `memory/` (Internal): Claude writes to this directory to track session history, architecture insights, and observed patterns, which it accesses via the `/memory` command.   

**Usage: How Claude Code Actually Uses the Folder**  
Claude Code treats the `.claude/` folder as its State & Context Engine: 

1. Bootstrapping: On launch, it merges instructions from three layers: Global (`~/.claude/`), Project-level (`./.claude/`), and any nested `CLAUDE.md` files in subdirectories.  
2. Priority Loading: It prioritizes project-specific settings over global ones to ensure it follows the unique rules of the current repository.  
3. Active Monitoring: It reads these files fresh on each tool call, meaning edits you make to rules or instructions are immediately "visible" to Claude in the next turn.  
4. Automatic Persistence: It uses the folder to "remember" state locally on your machine, preventing it from starting from scratch every time you restart the CLI.   

**Best Practice vs. Tool Logic**  
There is a distinct difference between what the tool *supports* and what experts *recommend* for efficiency: 

| Category  | How Claude Code Uses It | Expert Best Practice |
| :---- | :---- | :---- |
| CLAUDE.md Size | Technically supports long files. | Keep it under 200 lines. Bloated files degrade instruction following and waste tokens. |
| Instruction Scope | Loads all root instructions into every turn. | Move niche rules to the `rules/` folder. Use path-scoping so React rules only load when Claude is in `src/components/`. |
| Automation | Can attempt to guess build/test commands. | Explicitly list commands in `CLAUDE.md`. Claude performs better when it doesn't have to "explore" to find your test runner. |
| Verification | Can run any bash tool if permitted. | Always include verification steps. A best practice is to tell Claude to "run tests after fixing" in the instruction itself. |
| Global Config | Merges `~/.claude/` with local settings. | Keep global config near empty. Over-populating your global settings can cause "context bleed," where rules from one project interfere with another. |
