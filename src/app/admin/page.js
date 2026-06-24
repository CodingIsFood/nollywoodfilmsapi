'use client';
import { useState, useEffect } from 'react';

export default function AdminDashboard() {
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Form state
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    releaseYear: '',
    description: '',
    productionCompany: '',
    directedBy: '',
    producedBy: '',
    cast: '',
    posterUrl: ''
  });

  useEffect(() => {
    fetchFilms(currentPage);
  }, [currentPage]);

  const fetchFilms = async (page = 1) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/films?page=${page}&limit=10`);
      const data = await res.json();
      setFilms(data.films || []);
      setTotalPages(data.totalPages || 1);
      setCurrentPage(data.page || 1);
    } catch (error) {
      console.error('Error fetching films:', error);
    }
    setLoading(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let res;
      if (editingId) {
        res = await fetch(`/api/films/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      } else {
        res = await fetch('/api/films', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      }

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to save film');
        return;
      }

      resetForm();
      fetchFilms(currentPage);
    } catch (error) {
      console.error('Failed to save film:', error);
      alert('An unexpected error occurred while saving.');
    }
  };

  const editFilm = (film) => {
    setEditingId(film.id);
    setFormData({
      title: film.title || '',
      releaseYear: film.releaseYear || '',
      description: film.description || '',
      productionCompany: film.productionCompany || '',
      directedBy: film.directedBy || '',
      producedBy: film.producedBy || '',
      cast: film.cast ? film.cast.join(', ') : '',
      posterUrl: film.posterUrl || ''
    });
  };

  const deleteFilm = async (id) => {
    if (confirm('Are you sure you want to delete this film?')) {
      try {
        await fetch(`/api/films/${id}`, { method: 'DELETE' });
        fetchFilms(currentPage);
      } catch (error) {
        console.error('Failed to delete film:', error);
      }
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      title: '',
      releaseYear: '',
      description: '',
      productionCompany: '',
      directedBy: '',
      producedBy: '',
      cast: '',
      posterUrl: ''
    });
  };

  return (
    <main className="container">
      <h1 className="title" style={{ fontSize: '2.5rem' }}>Admin Dashboard</h1>
      <p className="subtitle" style={{ marginBottom: '2rem' }}>Manage your API data</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        
        {/* Form Column */}
        <div className="film-card" style={{ height: 'fit-content' }}>
          <h2 style={{ marginBottom: '1.5rem', fontWeight: '600' }}>
            {editingId ? 'Edit Film' : 'Add New Film'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Title *</label>
              <input required type="text" name="title" className="form-control" value={formData.title} onChange={handleInputChange} />
            </div>
            
            <div className="form-group">
              <label>Release Year</label>
              <input type="number" name="releaseYear" className="form-control" value={formData.releaseYear} onChange={handleInputChange} />
            </div>

            <div className="form-group">
              <label>Production Company</label>
              <input type="text" name="productionCompany" className="form-control" value={formData.productionCompany} onChange={handleInputChange} />
            </div>

            <div className="form-group">
              <label>Directed By</label>
              <input type="text" name="directedBy" className="form-control" value={formData.directedBy} onChange={handleInputChange} />
            </div>

            <div className="form-group">
              <label>Produced By</label>
              <input type="text" name="producedBy" className="form-control" value={formData.producedBy} onChange={handleInputChange} />
            </div>

            <div className="form-group">
              <label>Cast (comma-separated)</label>
              <input type="text" name="cast" className="form-control" value={formData.cast} onChange={handleInputChange} placeholder="e.g., Genevieve Nnaji, Ramsey Nouah" />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea name="description" className="form-control" rows="4" value={formData.description} onChange={handleInputChange} />
            </div>

            <div className="actions" style={{ marginTop: '2rem' }}>
              <button type="submit" className="btn" style={{ flex: 1 }}>
                {editingId ? 'Update Film' : 'Save Film'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Data Column */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading films...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Year</th>
                    <th>Company</th>
                    <th style={{ width: '150px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {films.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No films added yet.
                      </td>
                    </tr>
                  ) : (
                    films.map(film => (
                      <tr key={film.id}>
                        <td style={{ fontWeight: '500' }}>{film.title}</td>
                        <td>{film.releaseYear || '-'}</td>
                        <td>{film.productionCompany || '-'}</td>
                        <td>
                          <div className="actions">
                            <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }} onClick={() => editFilm(film)}>
                              Edit
                            </button>
                            <button className="btn btn-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }} onClick={() => deleteFilm(film.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
                  <button 
                    className="btn btn-secondary" 
                    disabled={currentPage <= 1} 
                    onClick={() => setCurrentPage(prev => prev - 1)}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button 
                    className="btn btn-secondary" 
                    disabled={currentPage >= totalPages} 
                    onClick={() => setCurrentPage(prev => prev + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
