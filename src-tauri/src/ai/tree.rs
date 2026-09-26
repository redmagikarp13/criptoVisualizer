use crate::error::{AppError, Result};

fn tree_error() -> AppError { AppError::new("process_control", "Não foi possível garantir o encerramento dos subprocessos. A execução foi bloqueada.") }

#[cfg(windows)]
mod platform {
    use super::*;
    use windows_sys::Win32::{Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE}, System::{JobObjects::*, Threading::{OpenThread, ResumeThread, THREAD_SUSPEND_RESUME}, Diagnostics::ToolHelp::*}};

    pub struct ProcessTree(isize);
    impl ProcessTree {
        pub fn new() -> Result<Self> {
            // O Job é criado antes do processo. O handle não é herdável.
            unsafe {
                let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if job.is_null() { return Err(tree_error()); }
                let tree = Self(job as isize);
                let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                if SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits as *const _ as *const _, std::mem::size_of_val(&limits) as u32) == 0 { return Err(tree_error()); }
                Ok(tree)
            }
        }
        pub fn attach(&mut self, child: &tokio::process::Child) -> Result<()> {
            unsafe {
                let handle = child.raw_handle().ok_or_else(tree_error)? as HANDLE;
                if AssignProcessToJobObject(self.0 as HANDLE, handle) == 0 { return Err(tree_error()); }
                let pid = child.id().ok_or_else(tree_error)?;
                let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
                if snapshot == INVALID_HANDLE_VALUE { return Err(tree_error()); }
                let mut entry: THREADENTRY32 = std::mem::zeroed();
                entry.dwSize = std::mem::size_of_val(&entry) as u32;
                let mut found = false;
                let mut more = Thread32First(snapshot, &mut entry);
                while more != 0 {
                    if entry.th32OwnerProcessID == pid {
                        let thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                        if !thread.is_null() {
                            found = ResumeThread(thread) != u32::MAX;
                            CloseHandle(thread);
                        }
                        break;
                    }
                    more = Thread32Next(snapshot, &mut entry);
                }
                CloseHandle(snapshot);
                if found { Ok(()) } else { Err(tree_error()) }
            }
        }
        pub fn terminate(&self) { unsafe { TerminateJobObject(self.0 as HANDLE, 1); } }
    }
    impl Drop for ProcessTree { fn drop(&mut self) { unsafe { CloseHandle(self.0 as HANDLE); } } }
}

#[cfg(unix)]
mod platform {
    use super::*;
    pub struct ProcessTree(Option<i32>);
    impl ProcessTree {
        pub fn new() -> Result<Self> { Ok(Self(None)) }
        pub fn attach(&mut self, child: &tokio::process::Child) -> Result<()> { self.0 = Some(child.id().ok_or_else(tree_error)? as i32); Ok(()) }
        pub fn terminate(&self) { if let Some(pid) = self.0 { unsafe { libc::kill(-pid, libc::SIGKILL); } } }
    }
    impl Drop for ProcessTree { fn drop(&mut self) { self.terminate(); } }
}
pub use platform::ProcessTree;
