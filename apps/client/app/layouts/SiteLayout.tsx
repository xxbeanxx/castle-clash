import { Outlet } from "react-router";
import { SiteFooter } from "../ui/SiteFooter.js";
import { SiteHeader } from "../ui/SiteHeader.js";

/**
 * Header, footer and a skip link around every page except `/play/:roomId`,
 * which is full-bleed (the canvas owns the whole viewport).
 */
export default function SiteLayout() {
  return (
    <div className="cc-shell">
      <a href="#main" className="cc-skip">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="cc-main">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
