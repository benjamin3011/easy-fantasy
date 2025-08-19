import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/firebase';
import ComponentCard from '../../components/common/ComponentCard';

interface HealthCheckResult {
  checkName: string;
  status: 'pass' | 'fail' | 'warning';
  details: string;
  affectedCount?: number;
  repairAvailable?: boolean;
}

interface HealthCheckSummary {
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  results: HealthCheckResult[];
  timestamp: any;
}

interface SystemHealthResponse {
  summary: HealthCheckSummary;
  dryRun: boolean;
}

interface RepairResponse {
  repairedCount: number;
  actions: string[];
  dryRun: boolean;
}

const systemHealthCheckCallable = httpsCallable(functions, 'systemHealthCheck');
const repairSystemIssuesCallable = httpsCallable(functions, 'repairSystemIssues');

export const HealthTools: React.FC = () => {
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [healthSummary, setHealthSummary] = useState<HealthCheckSummary | null>(null);
  const [repairResult, setRepairResult] = useState<RepairResponse | null>(null);
  const [selectedChecks, setSelectedChecks] = useState<string[]>(['all']);
  const [dryRun, setDryRun] = useState(true);

  const checkTypes = [
    { id: 'all', label: 'All Checks', description: 'Run comprehensive system health check' },
    { id: 'scores', label: 'Score Integrity', description: 'Verify lineup points match game stats' },
    { id: 'fields', label: 'Derived Fields', description: 'Check for missing calculated fields' },
    { id: 'orphans', label: 'Orphaned Documents', description: 'Find documents without valid references' },
    { id: 'tokens', label: 'Token Hygiene', description: 'Validate FCM and Web Push tokens' },
    { id: 'leagues', label: 'League Consistency', description: 'Verify member counts and standings' }
  ];

  const repairTypes = [
    { id: 'stale-tokens', label: 'Clean Stale Tokens', description: 'Remove invalid FCM tokens' },
    { id: 'missing-fields', label: 'Recalculate Fields', description: 'Mark lineups for score recalculation' }
  ];

  const handleCheckSelection = (checkId: string) => {
    if (checkId === 'all') {
      setSelectedChecks(['all']);
    } else {
      const newSelection = selectedChecks.includes('all') 
        ? [checkId]
        : selectedChecks.includes(checkId)
          ? selectedChecks.filter(id => id !== checkId)
          : [...selectedChecks.filter(id => id !== 'all'), checkId];
      setSelectedChecks(newSelection.length === 0 ? ['all'] : newSelection);
    }
  };

  const runHealthCheck = async () => {
    if (isRunningCheck) return;
    
    setIsRunningCheck(true);
    setRepairResult(null);
    
    try {
      const result = await systemHealthCheckCallable({
        checks: selectedChecks,
        dryRun: true // Health checks are always read-only
      });
      
      const data = result.data as SystemHealthResponse;
      setHealthSummary(data.summary);
    } catch (error) {
      console.error('Health check failed:', error);
      alert('Health check failed. Check console for details.');
    } finally {
      setIsRunningCheck(false);
    }
  };

  const runRepair = async (repairType: string) => {
    if (isRepairing) return;
    
    if (!dryRun) {
      const confirmed = window.confirm(
        `Are you sure you want to run repair: ${repairType}? This will make actual changes to the database.`
      );
      if (!confirmed) return;
    }
    
    setIsRepairing(true);
    
    try {
      const result = await repairSystemIssuesCallable({
        repairType,
        dryRun
      });
      
      const data = result.data as RepairResponse;
      setRepairResult(data);
    } catch (error) {
      console.error('Repair failed:', error);
      alert('Repair failed. Check console for details.');
    } finally {
      setIsRepairing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <span className="text-green-500 text-lg">✓</span>;
      case 'fail': return <span className="text-red-500 text-lg">✗</span>;
      case 'warning': return <span className="text-yellow-500 text-lg">⚠</span>;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case 'pass': return <span className={`${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`}>PASS</span>;
      case 'fail': return <span className={`${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`}>FAIL</span>;
      case 'warning': return <span className={`${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`}>WARNING</span>;
      default: return <span className={`${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200`}>UNKNOWN</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">System Health Tools</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2">
          Monitor and repair system integrity issues
        </p>
      </div>

      {/* Health Check Controls */}
      <ComponentCard title="System Health Check">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {checkTypes.map((check) => (
            <div
              key={check.id}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                selectedChecks.includes(check.id) || selectedChecks.includes('all')
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
              onClick={() => handleCheckSelection(check.id)}
            >
              <div className="flex items-center gap-2 mb-2">
                <input 
                  type="checkbox"
                  checked={selectedChecks.includes(check.id) || selectedChecks.includes('all')}
                  onChange={() => handleCheckSelection(check.id)}
                  className="rounded"
                />
                <span className="font-medium">{check.label}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {check.description}
              </p>
            </div>
          ))}
        </div>

        <button
          onClick={runHealthCheck}
          disabled={isRunningCheck}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md font-medium"
        >
          {isRunningCheck ? (
            <>🔄 Running Health Check...</>
          ) : (
            <>🛡️ Run Health Check</>
          )}
        </button>
      </ComponentCard>

      {/* Health Check Results */}
      {healthSummary && (
        <ComponentCard title="Health Check Results">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {healthSummary.totalChecks}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Checks</div>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {healthSummary.passed}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Passed</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {healthSummary.warnings}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Warnings</div>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {healthSummary.failed}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Failed</div>
            </div>
          </div>

          {/* Individual Check Results */}
          <div className="space-y-3">
            {healthSummary.results.map((result, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-4 border rounded-lg dark:border-gray-700"
              >
                {getStatusIcon(result.status)}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{result.checkName}</span>
                    {getStatusBadge(result.status)}
                    {result.affectedCount !== undefined && (
                      <span className="text-sm text-gray-500">
                        ({result.affectedCount} affected)
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {result.details}
                  </p>
                </div>
                {result.repairAvailable && (
                  <div className="text-sm">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      Repair Available
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ComponentCard>
      )}

      {/* Repair Tools */}
      <ComponentCard title="Repair Tools">
        <div className="mb-4">
          <label className="flex items-center gap-2">
            <input 
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="rounded"
            />
            <span>Dry Run (preview changes without applying)</span>
          </label>
        </div>

        <div className="space-y-4">
          {repairTypes.map((repair) => (
            <div
              key={repair.id}
              className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-700"
            >
              <div>
                <h3 className="font-medium">{repair.label}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {repair.description}
                </p>
              </div>
              <button
                onClick={() => runRepair(repair.id)}
                disabled={isRepairing}
                className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm"
              >
                {isRepairing ? '🔄' : 'Run Repair'}
              </button>
            </div>
          ))}
        </div>
      </ComponentCard>

      {/* Repair Results */}
      {repairResult && (
        <ComponentCard title="Repair Results">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-500 text-lg">✓</span>
              <span className="font-medium">
                {repairResult.dryRun ? 'Dry Run Complete' : 'Repair Complete'}
              </span>
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                {repairResult.repairedCount} items
              </span>
            </div>
            
            {repairResult.dryRun && (
              <p className="text-sm text-orange-600 dark:text-orange-400 mb-3">
                This was a dry run. No actual changes were made.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Actions {repairResult.dryRun ? 'to be taken' : 'taken'}:</h3>
            <ul className="space-y-1">
              {repairResult.actions.map((action, index) => (
                <li key={index} className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                  <div className="w-1 h-1 bg-gray-400 rounded-full" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        </ComponentCard>
      )}
    </div>
  );
};

export default HealthTools;