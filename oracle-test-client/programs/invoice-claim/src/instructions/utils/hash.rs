use sha2::{Digest, Sha256};

pub fn hash_ipfs(ipfs_hash: &str) -> [u8; 32] {
    Sha256::digest(ipfs_hash.as_bytes())
        .as_slice()
        .try_into()
        .expect("SHA256 output is always 32 bytes")
}
