/**
 * Utilities for detecting system-critical processes that should not be killed.
 */

/** Known Windows system processes that can crash the OS if killed */
const SYSTEM_PROCESS_NAMES = new Set([
    'system',
    'system idle process',
    'registry',
    'smss.exe',
    'csrss.exe',
    'wininit.exe',
    'services.exe',
    'lsass.exe',
    'svchost.exe',
    'winlogon.exe',
    'dwm.exe',
    'explorer.exe',
    'fontdrvhost.exe',
    'sihost.exe',
    'taskhostw.exe',
    'runtimebroker.exe',
    'shellexperiencehost.exe',
    'startmenuexperiencehost.exe',
    'searchhost.exe',
    'ctfmon.exe',
    'conhost.exe',
    'dllhost.exe',
    'wudfhost.exe',
    'spoolsv.exe',
    'lsaiso.exe',
    'securityhealthservice.exe',
    'sgrmbroker.exe',
    'msmpeng.exe',
    'nissrv.exe',
])

/** PIDs that are always system-critical */
const SYSTEM_PIDS = new Set([0, 4])

export interface SafetyCheck {
    isSafe: boolean
    isSystemCritical: boolean
    processName: string
    reason?: string
}

/**
 * Check if a process is safe to kill.
 */
export function checkProcessSafety(pid: number, processName: string): SafetyCheck {
    const nameLower = processName.toLowerCase()

    if (SYSTEM_PIDS.has(pid)) {
        return {
            isSafe: false,
            isSystemCritical: true,
            processName,
            reason: `PID ${pid} is a core Windows system process and cannot be killed.`,
        }
    }

    if (SYSTEM_PROCESS_NAMES.has(nameLower)) {
        return {
            isSafe: false,
            isSystemCritical: true,
            processName,
            reason: `"${processName}" is a critical Windows system process. Killing it may crash or destabilize the system.`,
        }
    }

    return { isSafe: true, isSystemCritical: false, processName }
}

export interface BulkSafetyResult {
    safePids: number[]
    blockedPids: { pid: number; name: string; reason: string }[]
    hasSystemProcesses: boolean
}

/**
 * Check a list of PIDs for safety before bulk-killing.
 */
export function checkBulkKillSafety(
    pids: number[],
    processNames: Map<number, string>,
): BulkSafetyResult {
    const safePids: number[] = []
    const blockedPids: { pid: number; name: string; reason: string }[] = []

    for (const pid of pids) {
        const name = processNames.get(pid) || 'Unknown'
        const check = checkProcessSafety(pid, name)
        if (check.isSafe) {
            safePids.push(pid)
        } else {
            blockedPids.push({ pid, name, reason: check.reason || 'System process' })
        }
    }

    return {
        safePids,
        blockedPids,
        hasSystemProcesses: blockedPids.length > 0,
    }
}
