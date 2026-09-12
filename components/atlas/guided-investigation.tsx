'use client';
import { ArrowRight, ArrowLeft, RotateCcw, X } from 'lucide-react';
import { INVESTIGATION } from '@/lib/atlas';

export default function GuidedInvestigation({
  step,
  onStep,
  onExit,
  onRestart,
  finding,
}: {
  step: number;
  onStep: (step: number) => void;
  onExit: () => void;
  onRestart: () => void;
  finding?: string;
}) {
  const current = INVESTIGATION[step];
  return (
    <section className="investigation" aria-label="Guided investigation">
      <div
        className="investigation-progress"
        aria-label={`Step ${step + 1} of ${INVESTIGATION.length}`}
      >
        <span className="guide-label">Guided investigation · 3–5 min</span>
        <ol>
          {INVESTIGATION.map((item, i) => (
            <li
              key={item.title}
              aria-current={i === step ? 'step' : undefined}
              className={i < step ? 'complete' : ''}
            >
              <span>{String(i + 1).padStart(2, '0')}</span>
              {item.title}
            </li>
          ))}
        </ol>
        <button className="text-button" onClick={onExit}>
          <X size={16} />
          Exit
        </button>
      </div>
      <div className="investigation-body">
        <div aria-live="polite" aria-atomic="true">
          <h2>{current.heading}</h2>
          <p>{step === 3 && finding ? finding : current.description}</p>
        </div>
        <div className="guide-actions">
          <button
            className="text-button restart"
            onClick={onRestart}
            title="Restore the bundled dataset and restart"
          >
            <RotateCcw size={15} />
            Restart
          </button>
          <button
            className="text-button"
            disabled={step === 0}
            onClick={() => onStep(step - 1)}
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <button
            className="primary-button"
            onClick={() =>
              step === INVESTIGATION.length - 1 ? onExit() : onStep(step + 1)
            }
          >
            {step === INVESTIGATION.length - 1 ? 'Explore freely' : 'Next'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
