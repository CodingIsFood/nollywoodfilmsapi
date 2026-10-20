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
ADMIN_PASSWORD=choose-a-strong-password

# Required for the automatic TMDB sync (see below).
# TMDB v4 "API Read Access Token" from https://www.themoviedb.org/settings/api
TMDB_API_TOKEN=your-tmdb-read-access-token

# Secret Vercel Cron sends as "Authorization: Bearer <CRON_SECRET>" to /api/cron/sync
# Generate one with: openssl rand -hex 32
CRON_SECRET=replace-with-a-long-random-string
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

## Automatic TMDB Weekly Sync

The platform can populate itself automatically from [themoviedb.org](https://www.themoviedb.org), replacing the manual "run a Python script → upload a CSV" workflow.

Every **Sunday at 03:00 UTC**, Vercel Cron calls `GET /api/cron/sync`, which:

1. Discovers Nigerian movies (`/discover/movie`) and TV shows (`/discover/tv`) with `with_origin_country=NG` for the **previous year + current year** (so titles that TMDB catalogs late are still picked up).
2. Fetches details + credits for each title and maps them into the `films` schema (Title, Type, Year, Cast, Director, Producer, Synopsis, Production/Network Company, Poster URL).
3. Merges each record into the database using the **same rules as the CSV bulk upload**:
   * Title + year match → fill only the fields that are currently empty (never overwrites curated data).
   * Title match with a different year → inserted as `Title (Year)`.
   * No match → inserted as a new record.
4. Records the run in `tmdb_sync_runs` so you can see what happened.

A Postgres advisory lock guarantees that two overlapping runs (e.g. a provider retry) can never mutate the data at the same time.

### Configuration

| Variable | Purpose |
| --- | --- |
| `TMDB_API_TOKEN` | TMDB v4 read access token (required). |
| `CRON_SECRET` | Shared secret Vercel Cron sends as `Authorization: Bearer <CRON_SECRET>`. If unset, Vercel's `x-vercel-cron` header is trusted instead. |

The schedule lives in [`vercel.json`](./vercel.json):

```json
{ "crons": [{ "path": "/api/cron/sync", "schedule": "0 3 * * 0" }] }
```

> **Note:** The sync makes many sequential TMDB calls per year. On Vercel, enable a runtime long enough to finish (`maxDuration = 300` is already set on the route; Pro plans allow up to 300s). If a run is cut short, simply re-run — the merge is idempotent, so already-imported titles are skipped.

### Manual triggers

* **Admin dashboard** → *TMDB Auto-Sync* panel → **Sync Now**. You can also **Pause / Enable** the scheduled sync without redeploying.
* **HTTP** — `GET /api/cron/sync` with the `Authorization: Bearer $CRON_SECRET` header (optional `?startYear=2025&endYear=2026`).
* **CLI** — run the exact same engine locally:

  ```bash
  node scripts/sync-tmdb.js            # previous + current year
  node scripts/sync-tmdb.js 2025 2026  # explicit inclusive year range
  ```

### Sync tables

The sync creates three helper tables automatically on first run (your existing `films` table is untouched):

* `tmdb_sync_runs` – history/status of each run (added, updated, skipped, errors).
* `tmdb_sync_state` – the enabled/paused flag.
* `tmdb_film_map` – maps a TMDB id + media type to the local `films.id`, so re-runs update the same record even if its title was disambiguated.

## Utility Scripts

The repository includes helper scripts for bulk data management and database operations.

### Update Cast from CSV (`update_cast_from_csv.js`)

This script updates existing database film records with additional cast members parsed from a CSV file.

* **Usage**:
  ```bash
  node update_cast_from_csv.js [path/to/file.csv]
  ```
  *(If no file path is provided, it defaults to `test_films.csv` in the root directory)*

* **CSV Format Requirements**:
  The target CSV file must include the following column headers:
  * `Title`: The title of the film (e.g., `The Wedding Party`).
  * `Year of Release`: The four-digit release year (e.g., `2016`).
  * `Full Cast`: Comma-separated list of cast members (e.g., `Adesua Etomi, Banky W., Richard Mofe-Damijo`).

* **Key Features & Behavior**:
  * **Title & Year Matching**: Matches CSV rows against database records using normalized titles (ignoring parentheses and case differences) and exact release year.
  * **Deduplication**: Compares CSV cast members against current database entries and only appends new cast members, preserving existing records without duplication.
  * **Database Connection**: Uses the `DATABASE_URL` configured in `.env.local` or environment variables.

## Deployment

This application is ready to be deployed on Vercel. Ensure you add all the Environment Variables listed above to your Vercel project settings before deploying.

```bash
npm run build
npm run start
```
