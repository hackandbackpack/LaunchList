import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { CONFIG } from '@/lib/config';
import logo from '@/assets/logo.png';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileMenuOpen(false), [location]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center group">
          <img
            src={logo}
            alt={CONFIG.store.name}
            className="h-10 w-auto transition-transform group-hover:scale-105"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost">Home</Button>
          </Link>
          <Link to="/submit">
            <Button variant="ghost">Submit Decklist</Button>
          </Link>
          <Link to="/status">
            <Button variant="ghost">Check Status</Button>
          </Link>
          <Link to="/help">
            <Button variant="ghost">Help</Button>
          </Link>
          <Link to="/staff/login">
            <Button variant="outline" size="sm">Staff Login</Button>
          </Link>
        </nav>

        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Backdrop */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t border-border bg-background/95 backdrop-blur-lg animate-fade-in z-50 relative">
          <div className="container mx-auto flex flex-col p-4 gap-2">
            <Link to="/" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start">Home</Button>
            </Link>
            <Link to="/submit" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start">Submit Decklist</Button>
            </Link>
            <Link to="/status" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start">Check Status</Button>
            </Link>
            <Link to="/help" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start">Help</Button>
            </Link>
            <Link to="/staff/login" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="outline" className="w-full">Staff Login</Button>
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
