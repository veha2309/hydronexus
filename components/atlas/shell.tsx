'use client';
import type { ReactNode } from 'react';
import { ArrowRight, Waves, Layers3, Radar, Upload, Info } from 'lucide-react';
import type { OceanView } from '@/lib/scene-math';

export function AtlasHeader({
  synthetic,
  view,
  onView,
  controlsOpen,
  inspectorOpen,
  onControls,
  onInspector,
  onImport,
  onAbout,
  onStart,
  guided,
  allowImport = true,
}: {
  synthetic: boolean;
  view: OceanView;
  onView: (view: OceanView) => void;
  controlsOpen: boolean;
  inspectorOpen: boolean;
  onControls: () => void;
  onInspector: () => void;
  onImport: () => void;
  onAbout: () => void;
  onStart: () => void;
  guided: boolean;
  allowImport?: boolean;
}) {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Waves size={29} strokeWidth={1.5} />
          <div>
            <strong>
              Hydro<span>Nexus</span>
            </strong>
            <small>Ocean atlas</small>
          </div>
        </div>
        <div className="atlas-context">
          Model fields &amp; instrument profiles
        </div>
        <div className="header-actions">
          <span className="demo-badge">
            {synthetic ? 'Synthetic demo' : 'Imported data'}
          </span>
          <button
            className="icon-button"
            aria-label="Dataset information"
            onClick={onAbout}
          >
            <Info size={18} />
          </button>
          {allowImport && (
            <button className="outline-button" onClick={onImport}>
              <Upload size={16} />
              <span>Import data</span>
            </button>
          )}
        </div>
      </header>
      <nav className="viewbar" aria-label="Atlas tools">
        <div className="view-actions">
          <button
            aria-controls="atlas-controls"
            aria-expanded={controlsOpen}
            className={controlsOpen ? 'active' : ''}
            onClick={onControls}
          >
            <Layers3 size={16} />
            Layers
          </button>
          <button
            aria-controls="atlas-inspector"
            aria-expanded={inspectorOpen}
            className={inspectorOpen ? 'active' : ''}
            onClick={onInspector}
          >
            <Radar size={16} />
            Observations
          </button>
        </div>
        <div className="view-selector">
          <label htmlFor="ocean-view">View</label>
          <select
            id="ocean-view"
            aria-label="Ocean view"
            value={view}
            onChange={(e) => onView(e.target.value as OceanView)}
          >
            <option value="map">Surface map</option>
            <option value="volume">Water column</option>
            <option value="section">Depth section</option>
            <option value="globe">Globe</option>
          </select>
        </div>
        <button
          className="text-button start-guide"
          disabled={guided}
          onClick={onStart}
        >
          {guided ? 'Investigation in progress' : 'Guided investigation'}
          <ArrowRight size={16} />
        </button>
      </nav>
    </>
  );
}

export function AtlasShell({
  controls,
  inspector,
  controlsOpen,
  inspectorOpen,
  onClosePanels,
  children,
}: {
  controls: ReactNode;
  inspector: ReactNode;
  controlsOpen: boolean;
  inspectorOpen: boolean;
  onClosePanels: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`workarea ${controlsOpen ? 'left-open' : ''} ${inspectorOpen ? 'right-open' : ''}`}
    >
      {controlsOpen && (
        <aside
          id="atlas-controls"
          className="panel controls"
          aria-label="Layers panel"
        >
          {controls}
        </aside>
      )}
      <section className="ocean-stage" aria-label="Ocean visualization">
        {children}
      </section>
      {inspectorOpen && (
        <aside
          id="atlas-inspector"
          className="panel analysis"
          aria-label="Instrument inspector"
        >
          {inspector}
        </aside>
      )}
      {(controlsOpen || inspectorOpen) && (
        <button
          className="sheet-backdrop"
          aria-label="Dismiss tool sheet"
          onClick={onClosePanels}
          tabIndex={-1}
        />
      )}
    </div>
  );
}
