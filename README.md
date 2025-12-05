# Advent Calendar

## Features:

- Grid of doors that can be opened only on or after their opening date.
- Edit mode (`/editmode/{code}`) shows toolbar and door settings.
- Shareable compressed state in the URL using `lz-string`.
- Import a background image; doors can project the background if enabled.

Getting started (Windows PowerShell):

```powershell
npm install
npm run dev
```

Open `http://localhost:5173/` after `npm run dev`.

To share a calendar, copy the code at the end of the domain and send the URL `https://yourhost/{code}` or `https://yourhost/editmode/{code}` for editing.
