"use client";

import { NavProvider } from "@/components/drishti/shell";
import HomeView from "@/components/views/home-view";
import HowView from "@/components/views/how-view";
import ScreeningView from "@/components/views/screening-view";
import DashboardView from "@/components/views/dashboard-view";
import ValidationView from "@/components/views/validation-view";
import CapacityView from "@/components/views/capacity-view";
import AboutView from "@/components/views/about-view";

export default function Page() {
  return (
    <NavProvider>
      {(view) => {
        switch (view) {
          case "how":
            return <HowView />;
          case "screening":
            return <ScreeningView />;
          case "dashboard":
            return <DashboardView />;
          case "validation":
            return <ValidationView />;
          case "capacity":
            return <CapacityView />;
          case "about":
            return <AboutView />;
          default:
            return <HomeView />;
        }
      }}
    </NavProvider>
  );
}
