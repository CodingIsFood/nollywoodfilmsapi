'use client';
import { useState, useEffect } from 'react';

export default function AdminDashboard() {
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  
  // Bulk upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  
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
    fetchFilms(currentPage, searchQuery);
  }, [currentPage, searchQuery]);

  const fetchFilms = async (page = 1, query = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/films?page=${page}&limit=10&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setFilms(data.films || []);
      setTotalPages(data.totalPages || 1);
      setCurrentPage(data.page || 1);
    } catch (error) {
      console.error('Error fetching films:', error);
    }
    setLoading(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    setSearchQuery(searchInput);
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    const fileInput = e.target.elements.csvFile;
    const file = fileInput.files[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/films/bulk', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to upload CSV');
      } else {
        setUploadResult(data);
        fetchFilms(currentPage, searchQuery);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('An unexpected error occurred during upload.');
    } finally {
      setUploading(false);
      e.target.reset();
    }
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
      fetchFilms(currentPage, searchQuery);
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
        fetchFilms(currentPage, searchQuery);
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Bulk Upload CSV */}
          <div className="film-card" style={{ height: 'fit-content' }}>
            <h2 style={{ marginBottom: '1.5rem', fontWeight: '600' }}>Bulk Upload CSV</h2>
            <form onSubmit={handleFileUpload}>
              <div className="form-group">
                <input required type="file" name="csvFile" accept=".csv" className="form-control" style={{ padding: '0.5rem' }} />
              </div>
              <button type="submit" className="btn" disabled={uploading} style={{ width: '100%', marginTop: '1rem' }}>
                {uploading ? 'Uploading...' : 'Upload CSV'}
              </button>
            </form>
            {uploadResult && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                <p style={{ fontWeight: '500', marginBottom: '0.5rem', color: uploadResult.skippedCount > 0 ? '#ffb86c' : '#50fa7b' }}>
                  {uploadResult.message}
                </p>
                {uploadResult.skippedTitles && uploadResult.skippedTitles.length > 0 && (
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
                    <p style={{ fontWeight: '600' }}>Skipped Titles:</p>
                    <ul style={{ paddingLeft: '1.5rem', marginTop: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                      {uploadResult.skippedTitles.map((t, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{t}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

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
        </div>

        {/* Data Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Search Box */}
          <div className="film-card" style={{ padding: '1.5rem' }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem' }}>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Search films by title..." 
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn" style={{ whiteSpace: 'nowrap' }}>
                Search
              </button>
              {searchQuery && (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setSearchInput('');
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                >
                  Clear
                </button>
              )}
            </form>
          </div>

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
