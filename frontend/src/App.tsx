import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import AuthGate from "@/components/AuthGate";
import { Toaster } from "@/components/ui/sonner";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<AuthGate>{(accountId, signOut) => <Home accountId={accountId} onLogout={signOut} />}</AuthGate>} />
      </Routes>
      <Toaster richColors />
    </>
  );
}
