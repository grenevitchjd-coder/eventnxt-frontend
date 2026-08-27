import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AuthComplete from './pages/AuthComplete'
import Dashboard from './pages/Dashboard'
import PublicEventPage from './pages/PublicEventPage'
import PublicRSVPPage from './pages/PublicRSVPPage'
import { isAuthenticated } from './api'

function RequireAuth({ children }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/complete" element={<AuthComplete />} />
        {/* Public — no auth. The actual shareable page for an event. */}
        <Route path="/e/:slug" element={<PublicEventPage />} />
        {/* Public — no auth. A specific guest's own RSVP / ticket-distribution link. */}
        <Route path="/rsvp/:token" element={<PublicRSVPPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}