# Tick Quick Entries (Chrome)

A Chrome extension that logs hours to [Tickspot](https://www.tickspot.com) for many days at once, using the official API v2.

## Installation

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Click the extension icon → ⚙ → paste your Subscription ID and API token (both are on the **Edit profile** page in Tick) and your Tick account email.

## Usage

- Select days in the calendar (click to select / deselect; "Workdays this month" selects Mon–Fri).
- Pick a project, a task, the number of hours per day and, optionally, a note.
- Click **Submit**. A separate entry is created for each day. Progress and errors are shown below the button.
- Days that already have hours logged show the total in the calendar, and you'll get a warning before submitting.

Public holidays aren't deselected automatically – deselect them by hand.

## Notes

Tick's API rejects the browser's User-Agent, so the extension overrides it for its own API requests with `TickAddon (<your email>)`.
