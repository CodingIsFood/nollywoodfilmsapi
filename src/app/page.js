'use client';
import { useState, useEffect } from 'react';

export default function Home() {
  const [query, setQuery] = useState('');
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchFilms('', 1);
  }, []);

  const fetchFilms = async (searchQuery = '', pageNum = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/films?q=${encodeURIComponent(searchQuery)}&page=${pageNum}&limit=12`);
      const data = await res.json();
      
      if (append) {
        setFilms(prev => [...prev, ...data.films]);
      } else {
        setFilms(data.films);
      }
      
      setTotalPages(data.totalPages);
      setPage(data.page);
    } catch (error) {
      console.error('Error fetching films:', error);
    }
    
    setLoading(false);
    setLoadingMore(false);
  };

  const handleSearch = (e) => {
    const val = e.target.value;
    setQuery(val);
    fetchFilms(val, 1, false);
  };

  const loadMore = () => {
    if (page < totalPages) {
      fetchFilms(query, page + 1, true);
    }
  };

  return (
    <main className="container">
      <h1 className="title">Explore Nollywood</h1>
      <p className="subtitle">Discover the vibrant world of Nigerian cinema</p>

      <div className="search-container">
        <div className="search-box">
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search by film title, actor, or keyword..." 
            value={query}
            onChange={handleSearch}
          />
        </div>
      </div>

      {loading && films.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
      ) : (
        <>
          <div className="film-grid">
            {films.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', gridColumn: '1 / -1', textAlign: 'center' }}>
                No films found.
              </div>
            ) : (
              films.map(film => (
                <div className="film-card" key={film.id}>
                  <div className="film-title">{film.title}</div>
                  {film.releaseYear && <div className="film-year">{film.releaseYear}</div>}
                  {film.description && <div className="film-desc">{film.description}</div>}
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {film.productionCompany && (
                      <div className="film-meta">
                        Company: <span>{film.productionCompany}</span>
                      </div>
                    )}
                    {film.cast && film.cast.length > 0 && (
                      <div className="film-meta">
                        Cast: <span>{film.cast.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {page < totalPages && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={loadMore} 
                disabled={loadingMore}
                style={{ padding: '0.8rem 2rem', borderRadius: '30px' }}
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
