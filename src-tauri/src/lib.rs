#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod audio;
mod database;
pub mod lyrics;
mod metadata;
mod scanner;

#[cfg(target_os = "android")]
mod android;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop;
#[cfg(target_os = "ios")]
mod ios;

#[cfg(target_os = "android")]
pub use android::run;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use desktop::run;
#[cfg(target_os = "ios")]
pub use ios::run;

mod commands;
