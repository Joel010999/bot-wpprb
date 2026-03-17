"use client";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import Campaigns from "@/components/Campaigns";
import Leads from "@/components/Leads";
import Fleet from "@/components/Fleet";
import Inbox from "@/components/Inbox";
import Scraper from "@/components/Scraper";
import DirectTarget from "@/components/DirectTarget";
import Settings from "@/components/Settings";

export default function Home() {
  const [activePage, setActivePage] = useState("dashboard");

  const renderPage = () => {
    switch (activePage) {
      case "dashboard": return <Dashboard />;
      case "campaigns": return <Campaigns />;
      case "leads": return <Leads />;
      case "fleet": return <Fleet />;
      case "inbox": return <Inbox />;
      case "scraper": return <Scraper />;
      case "sniper": return <DirectTarget />;
      case "settings": return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
