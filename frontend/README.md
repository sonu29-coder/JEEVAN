# JEEVAN – Frontend

JEEVAN is a web-based platform designed to support blood donation and donor connectivity through a user-friendly interface.

## Technology Stack

* **Framework:** Next.js
* **Language:** TypeScript
* **UI:** React
* **Styling:** Tailwind CSS
* **Package Manager:** npm

## Project Structure

```text
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── public/
├── components/
├── package.json
├── package-lock.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

*Note: The structure may vary depending on the files present in your project.*

## Prerequisites

* Node.js (LTS version recommended)
* npm
* Git

## Run the Frontend Locally

1. Navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open your browser and visit:

   http://localhost:3000

## Build for Production

Run the following commands:

```bash
npm run build
npm start
```

## Backend Integration

The frontend can communicate with the JEEVAN backend API built with FastAPI. Configure the backend API URL using the environment variables required by your application.

Do not commit API secrets or private credentials to GitHub.

## Development

Edit the relevant files inside the `app/` and `components/` directories to update the frontend. Next.js refreshes the page automatically during development.

## License

Add the appropriate license information if applicable.

