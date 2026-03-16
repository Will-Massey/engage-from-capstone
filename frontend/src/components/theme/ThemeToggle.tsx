import { SunIcon } from '@heroicons/react/24/outline';

// Theme toggle - Light mode only for now
const ThemeToggle = () => {
  return (
    <div className="p-2 rounded-lg text-slate-400">
      <SunIcon className="h-5 w-5" title="Light mode" />
    </div>
  );
};

export default ThemeToggle;
