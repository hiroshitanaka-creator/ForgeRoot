use std::path::PathBuf;

use clap::{Parser, Subcommand};
use forge_kernel::{canonical_string, parse_file, verify_integrity, IntegrityStatus};

#[derive(Debug, Parser)]
#[command(name = "forge-kernel")]
#[command(about = "ForgeRoot .forge v1 parser, canonicalizer, and hash verifier")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Parse and validate a .forge file, then print its canonical hash.
    Hash { path: PathBuf },

    /// Print the canonical byte stream as UTF-8 text.
    Canonicalize { path: PathBuf },

    /// Parse, validate shape, and verify integrity.canonical_hash when present.
    Verify { path: PathBuf },
}

fn main() {
    if let Err(err) = run() {
        eprintln!("error: {err}");
        std::process::exit(1);
    }
}

fn run() -> forge_kernel::Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Hash { path } => {
            let doc = parse_file(path)?;
            println!("{}", doc.canonical_hash);
        }
        Command::Canonicalize { path } => {
            let doc = parse_file(path)?;
            print!("{}", canonical_string(&doc.value)?);
        }
        Command::Verify { path } => {
            let doc = parse_file(path)?;
            match verify_integrity(&doc.value)? {
                IntegrityStatus::PresentAndValid { hash } => {
                    println!("valid {hash}");
                }
                IntegrityStatus::Absent { hash } => {
                    println!("valid external-hash {hash}");
                }
            }
        }
    }
    Ok(())
}
