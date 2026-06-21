import './globals.css'
import Link from 'next/link'
import { cookies } from 'next/headers'

export const metadata = {
  title: 'Nollywood API',
  description: 'Search for Nigerian films and manage your API data',
}

export default function RootLayout({ children }) {
  const cookieStore = cookies()
  const isAuthenticated = cookieStore.get('auth-token')?.value === 'authenticated'

  return (
    <html lang="en">
      <body>
        <nav className="navbar">
          <Link href="/" className="nav-brand">Nollywood API</Link>
          <div className="nav-links">
            <Link href="/">Search</Link>
            {isAuthenticated && <Link href="/admin">Admin Dashboard</Link>}
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}
