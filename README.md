# Nollywood API

Nollywood API is a fully-featured content management platform and API for Nigerian films. Built with Next.js and powered by a Neon PostgreSQL database, this application provides both a comprehensive RESTful API for querying film data and a sleek Admin Dashboard for content management.

## Tech Stack

*   **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
*   **Library**: [React 18](https://react.dev/)
*   **Database**: [Neon (PostgreSQL)](https://neon.tech/)
*   **Styling**: Vanilla CSS

## Features

*   **Database Integration**: Direct interaction with a Neon Serverless Postgres database.
*   **Admin Dashboard**: A secure, paginated, and intuitive interface to create, update, and delete film records. Includes built-in data validation to prevent duplicate film titles.
*   **Film Search & Pagination**: Full support for searching films by title and paginating through results via the API.
*   **Rich Data Model**: Extensible content model supporting fields like Title, Release Year, Description, Production Company, Directed By, Produced By, Cast, and Poster URLs.

## Getting Started

### Prerequisites

*   Node.js (v18.x or newer recommended)
*   A Neon PostgreSQL database instance.

### Installation

1.  Clone the repository and navigate into the project directory:
    ```bash
    cd nollywoodapi
    ```
2.  Install the dependencies:
    ```bash
    npm install
    ```

### Environment Variables

Create a `.env.local` file in the root directory of your project and populate it with your database connection URI:

```env
DATABASE_URL=postgres://user:password@hostname/database
```

### Running the Application Locally

Start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.
Navigate to [http://localhost:3000/admin](http://localhost:3000/admin) to access the admin dashboard.

## Database Schema

Your Neon PostgreSQL database should contain a `films` table with the following schema:

*   `id` (VARCHAR PRIMARY KEY)
*   `title` (TEXT NOT NULL)
*   `release_year` (INTEGER)
*   `description` (TEXT)
*   `production_company` (TEXT[])
*   `directed_by` (TEXT[])
*   `produced_by` (TEXT[])
*   `cast` (TEXT[])
*   `poster_url` (TEXT)
*   `created_at` (TIMESTAMP)
*   `updated_at` (TIMESTAMP)

## API Reference

The application exposes Next.js Route Handlers to interact with the film database.

### List / Search Films
*   **Endpoint**: `GET /api/films`
*   **Query Parameters**:
    *   `q` (optional): Search query for titles.
    *   `page` (optional): Page number (defaults to 1).
    *   `limit` (optional): Number of films per page (defaults to 12).
*   **Response**: Returns paginated films, total count, and total pages.

### Create Film
*   **Endpoint**: `POST /api/films`
*   **Body**: JSON object containing film fields.
*   **Response**: 201 Created with the generated film ID and data. (Returns `400 Bad Request` if a film with the exact same title already exists to prevent duplicates).

### Get Film by ID
*   **Endpoint**: `GET /api/films/[id]`
*   **Response**: Details of the specific film.

### Update Film
*   **Endpoint**: `PUT /api/films/[id]`
*   **Body**: JSON object containing updated film fields.
*   **Response**: 200 OK with the updated film data.

### Delete Film
*   **Endpoint**: `DELETE /api/films/[id]`
*   **Response**: 200 OK confirming deletion.

## Deployment

This application is ready to be deployed on Vercel. Ensure you add all the Environment Variables listed above to your Vercel project settings before deploying.

```bash
npm run build
npm run start
```
