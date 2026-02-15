import { Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CONFIG } from '@/lib/config';

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50 py-8">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-gradient">{CONFIG.store.name}</span>
          </div>
          
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/submit" className="hover:text-foreground transition-colors">
              Submit Decklist
            </Link>
            <Link to="/help" className="hover:text-foreground transition-colors">
              Help
            </Link>
            <Link to="/status" className="hover:text-foreground transition-colors">
              Track Order
            </Link>
            <Link to="/staff/login" className="hover:text-foreground transition-colors">
              Staff
            </Link>
          </div>
          
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {CONFIG.store.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
