'use client';

interface TimelineStep {
  label: string;
  time?: string;
  active: boolean;
  completed: boolean;
}

interface AssignmentTimelineProps {
  steps: TimelineStep[];
}

export default function AssignmentTimeline({ steps }: AssignmentTimelineProps) {
  return (
    <div className="space-y-0">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-3 h-3 rounded-full border-2 ${step.completed ? 'bg-[#8c6239] border-[#8c6239]' : step.active ? 'bg-white border-[#8c6239]' : 'bg-gray-200 border-gray-200'}`} />
            {i < steps.length - 1 && (
              <div className={`w-0.5 h-8 ${step.completed ? 'bg-[#8c6239]' : 'bg-gray-200'}`} />
            )}
          </div>
          <div className={`pb-6 ${step.active ? 'text-[#1f2933] font-bold' : step.completed ? 'text-gray-600' : 'text-gray-400'}`}>
            <div className="text-sm">{step.label}</div>
            {step.time && <div className="text-xs text-gray-400 mt-0.5">{step.time}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
