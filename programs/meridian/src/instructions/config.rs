use anchor_lang::prelude::*;

use crate::{account_types::InitializeConfigAccounts, InitializeConfigParams};

pub fn initialize_config(
    ctx: Context<InitializeConfigAccounts>,
    params: InitializeConfigParams,
) -> Result<()> {
    let bump = ctx.bumps.config;
    ctx.accounts
        .config
        .initialize(bump, &params, ctx.accounts.admin_authority.key())
}
