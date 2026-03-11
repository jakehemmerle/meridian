use anchor_lang::prelude::*;

declare_id!("2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y");

#[program]
pub mod meridian {
    use super::*;

    pub fn bootstrap(_ctx: Context<Bootstrap>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Bootstrap {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn program_id_matches_workspace_keypair() {
        let expected = Pubkey::from_str("2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y").unwrap();
        assert_eq!(crate::ID, expected);
    }
}

