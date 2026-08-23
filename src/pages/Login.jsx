import { getLoginUrl } from '../api'

export default function Login() {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark" />
        <h1 className="login-title">EventNXT</h1>
        <p className="login-subtitle">Guest lists, RSVPs, and influencer-tracked sales.</p>
        <a className="btn btn-primary" href={getLoginUrl()}>
          Sign in with Events360
        </a>
      </div>
    </div>
  )
}