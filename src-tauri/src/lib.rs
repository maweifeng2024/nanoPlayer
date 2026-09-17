#[cfg(not(target_os = "android"))]
mod audio;
mod database;
pub mod lyrics;
mod metadata;
mod scanner;

#[cfg(target_os = "android")]
mod android;
#[cfg(not(target_os = "android"))]
mod desktop;

#[cfg(target_os = "android")]
pub use android::run;
#[cfg(not(target_os = "android"))]
pub use desktop::run;

mod commands;
