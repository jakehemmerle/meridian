use anchor_lang::prelude::*;

use crate::account_types::PauseProtocolAccounts;

pub fn pause_protocol(ctx: Context<PauseProtocolAccounts>) -> Result<()> {
    ctx.accounts.config.is_paused = true;
    Ok(())
}

pub fn unpause_protocol(ctx: Context<PauseProtocolAccounts>) -> Result<()> {
    ctx.accounts.config.is_paused = false;
    Ok(())
}
