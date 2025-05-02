import { BrowserRouter as Router, Routes, Route } from "react-router";
import { AuthProvider } from "./context/AuthContext";
import AppLayout from "./layout/AppLayout";
import PrivateRoute from "./components/auth/PrivateRoute";
import SignIn from "./pages/Authentication/SignIn";
import SignUp from "./pages/Authentication/SignUp";
import ResetPassword from "./pages/Authentication/ResetPassword";
import Dashboard from './pages/Dashboard';
import LeaguesPage   from "./pages/LeaguesPage";
import LeagueDetail from "./pages/LeagueDetail";
import PWAPrompt from 'react-ios-pwa-prompt';
import { Toaster } from 'react-hot-toast';

function App() {

  return (
    <>
    <AuthProvider>
      <Router>
        <Routes>
        {/* private */}
        <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/leagues"  element={<LeaguesPage />} />
          <Route path="/leagues/:id" element={<LeagueDetail />} /> 
        </Route>
        {/* public */}
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </Router>
      <PWAPrompt />
      <Toaster />
    </AuthProvider>
    </>
  )
}

export default App
