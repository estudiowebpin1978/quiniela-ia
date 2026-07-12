"use client";
import { useMemo } from "react";
import { sound } from "@/lib/sound/audio-manager";

interface TabConfig {
  id: string;
  label: string;
  icon: string;
  locked?: boolean;
  lockReason?: string;
}

interface PredictionTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: TabConfig[];
  guestMode?: boolean;
}

export function PredictionTabs({ activeTab, onTabChange, tabs, guestMode }: PredictionTabsProps) {
  return useMemo(() => (
    <div className="tbs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tb ${tab.id === "pred" ? "tb-pred" : tab.id === "rdbl" ? "tb-rdbl" : tab.id === "freq" ? "tb-freq" : tab.id === "trend" ? "tb-trend" : tab.id === "mis" ? "tb-mis" : tab.id === "acc" ? "tb-acc" : ""} ${activeTab === tab.id ? " on" : ""}`}
          onClick={() => {
            if (tab.locked && guestMode) {
              alert(tab.lockReason || "Función solo para usuarios registrados");
              return;
            }
            sound.pop();
            onTabChange(tab.id);
          }}
          disabled={tab.locked && guestMode}
        >
          <span className="tb-ico">{tab.icon}</span>
          <span className="tb-lbl">{tab.label}</span>
        </button>
      ))}
    </div>
  ), [activeTab, onTabChange, tabs, guestMode]);
}