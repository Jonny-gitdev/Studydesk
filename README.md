# StudyDesk

A lightweight, single-file web app for organizing university lectures, learning plans, tasks, and notes across any course of study.

Everything runs locally in your browser. No server, no account, no internet connection required.

---

## What it's for

Keeping track of university life across multiple subjects is messy. StudyDesk gives you one place to log your lectures, mark which ones you've caught up on, manage to-dos per subject, and keep free-form notes — all without any setup or external dependencies. Open `index.html` in a browser to get started; the other sections are available through the navigation.

Your data is stored in your browser's `localStorage` and can be exported and imported as a JSON file at any time, so you never lose anything.

---

## Features

### Lecture Tracking

Each lecture is a card with a subject, date, optional link (e.g. to a recording or slide deck), and a short note. You can mark lectures as:

- **Done** — you've watched or attended it
- **Cancelled** — the lecture didn't take place
- **Priority** — you need to catch up on this one first

The list can be filtered by status (open, done, priority, cancelled). Lectures that are neither done nor cancelled are automatically tagged *nachholen* (catch up) as a visual reminder.

### Schedule & Automatic Lecture Generation

The **Stundenplan** (schedule) tab lets you define recurring time slots: a subject, a weekday, and a date range for the semester. Once your schedule is set up, the app automatically creates lecture entries for past occurrences within those date ranges whenever it is opened. You can also click **"Verpasste Vorlesungen generieren"** to run the same operation manually.

This is the core time-saver of the app. Set up your schedule once at the start of semester, and all past lectures are generated in one click. The generator skips entries that already exist, so it's safe to run multiple times.

### Weekly Learning Plan

The **Lernplan** tab provides a weekly calendar for recurring study blocks. Add a block by dragging across a free time range, move it between days by dragging, or resize it from either edge. Each block has its own name, description, color, and optional class.

Classes contain ordered subtasks with a required number of study units. Class blocks are filled with the next open subtask automatically. Marking a unit complete records progress and advances the class; marking it as not completed leaves that unit for the next appointment and shifts later class work back by one appointment. Class progress and the recurring plan are stored locally and included in data exports.

### To-Do List

A simple task list with subject tagging and priority levels (normal / high). Todos can be filtered by status and are also shown as a quick overview on the dashboard. Pressing `Enter` in the input field adds the task immediately.

### Notes

A free-form note editor with a sidebar for navigation. Notes are searchable by title. Inside the note body, anything prefixed with `#` is automatically extracted as a **research tag** — useful for flagging topics you need to look into further.

### Dashboard

The first tab gives a quick overview of pending lectures and open to-dos across all subjects, along with counters for your overall progress. It also shows today's learning plan as a calendar with a live current-time marker; learning blocks can be marked as done or missed there. It updates in real time as you check things off.

### Export & Import

Your data can be exported as a `.json` file at any time via the **Export** button in the top bar. The same file can be re-imported on any device or browser using the **Import** button. Import fully replaces the current data, so export first if you want a backup.

---

## Contributing

Feature suggestions are very welcome — feel free to open an issue describing what you'd have in mind.

Pull requests are also appreciated. The one thing to keep in mind: StudyDesk is intentionally simple. It uses static HTML, CSS, and JavaScript with no build step, framework, or external dependencies. Contributions that add genuinely useful functionality are great; contributions that add complexity for its own sake, or that require introducing a build pipeline or external libraries, are unlikely to be merged. If in doubt, open an issue first to discuss.
