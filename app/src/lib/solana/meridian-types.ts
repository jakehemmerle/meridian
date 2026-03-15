/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/meridian.json`.
 */
export type Meridian = {
  "address": "2xETnXSFhwUs9c1BJZHwWib2jQMnYdUGL3QbtewVfA2y",
  "metadata": {
    "name": "meridian",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Meridian Anchor program scaffold"
  },
  "instructions": [
    {
      "name": "addStrike",
      "discriminator": [
        226,
        190,
        94,
        4,
        5,
        106,
        15,
        120
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "adminAuthority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "yesMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  121,
                  101,
                  115,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "noMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  111,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createMarketParams"
            }
          }
        }
      ]
    },
    {
      "name": "adminSettleOverride",
      "discriminator": [
        92,
        131,
        189,
        52,
        161,
        70,
        203,
        95
      ],
      "accounts": [
        {
          "name": "adminAuthority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          },
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "overridePrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closeMarket",
      "discriminator": [
        88,
        154,
        248,
        186,
        48,
        14,
        123,
        244
      ],
      "accounts": [
        {
          "name": "operationsAuthority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          },
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "operationsAuthority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "yesMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  121,
                  101,
                  115,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "noMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  111,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createMarketParams"
            }
          }
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "adminAuthority",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeConfigParams"
            }
          }
        }
      ]
    },
    {
      "name": "mergePair",
      "discriminator": [
        30,
        61,
        163,
        68,
        40,
        68,
        160,
        222
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          },
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "yesMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "noMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "userUsdc",
          "writable": true
        },
        {
          "name": "userYes",
          "writable": true
        },
        {
          "name": "userNo",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "pairs",
          "type": "u64"
        }
      ]
    },
    {
      "name": "mintPair",
      "discriminator": [
        19,
        149,
        94,
        110,
        181,
        186,
        33,
        107
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          },
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "yesMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "noMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "userUsdc",
          "writable": true
        },
        {
          "name": "userYes",
          "writable": true
        },
        {
          "name": "userNo",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "pairs",
          "type": "u64"
        }
      ]
    },
    {
      "name": "pauseProtocol",
      "discriminator": [
        144,
        95,
        0,
        107,
        119,
        39,
        248,
        141
      ],
      "accounts": [
        {
          "name": "adminAuthority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "redeem",
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          },
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "yesMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "noMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "userUsdc",
          "writable": true
        },
        {
          "name": "userYes",
          "writable": true
        },
        {
          "name": "userNo",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "pairs",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleMarket",
      "discriminator": [
        193,
        153,
        95,
        216,
        166,
        6,
        144,
        217
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          },
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "priceUpdate"
        }
      ],
      "args": []
    },
    {
      "name": "tradeYes",
      "discriminator": [
        251,
        107,
        27,
        10,
        254,
        242,
        152,
        162
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          },
          "relations": [
            "market"
          ]
        },
        {
          "name": "market"
        },
        {
          "name": "yesMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "phoenixMarket",
          "writable": true
        },
        {
          "name": "userYes",
          "writable": true
        },
        {
          "name": "userUsdc",
          "writable": true
        },
        {
          "name": "phoenixBaseVault",
          "writable": true
        },
        {
          "name": "phoenixQuoteVault",
          "writable": true
        },
        {
          "name": "seat",
          "writable": true
        },
        {
          "name": "logAuthority"
        },
        {
          "name": "phoenixProgram",
          "address": "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "orderParams"
            }
          }
        }
      ]
    },
    {
      "name": "unpauseProtocol",
      "discriminator": [
        183,
        154,
        5,
        183,
        105,
        76,
        87,
        18
      ],
      "accounts": [
        {
          "name": "adminAuthority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "meridianConfig",
      "discriminator": [
        188,
        16,
        35,
        87,
        172,
        21,
        211,
        200
      ]
    },
    {
      "name": "meridianMarket",
      "discriminator": [
        41,
        191,
        208,
        156,
        107,
        72,
        223,
        29
      ]
    },
    {
      "name": "priceUpdateV2",
      "discriminator": [
        34,
        241,
        35,
        99,
        157,
        126,
        244,
        205
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "configAlreadyInitialized",
      "msg": "The config account has already been initialized."
    },
    {
      "code": 6001,
      "name": "initializeAuthorityMismatch",
      "msg": "The signing authority does not match the configured admin authority."
    },
    {
      "code": 6002,
      "name": "invalidAdminAuthority",
      "msg": "The admin authority cannot be the default address."
    },
    {
      "code": 6003,
      "name": "invalidOperationsAuthority",
      "msg": "The operations authority cannot be the default address."
    },
    {
      "code": 6004,
      "name": "invalidUsdcMint",
      "msg": "The USDC mint cannot be the default address."
    },
    {
      "code": 6005,
      "name": "invalidPythReceiverProgram",
      "msg": "The Pyth receiver program cannot be the default address."
    },
    {
      "code": 6006,
      "name": "invalidOracleMaximumAge",
      "msg": "The oracle maximum age must be positive."
    },
    {
      "code": 6007,
      "name": "invalidOracleConfidenceLimit",
      "msg": "The oracle confidence limit must be between 1 and 10_000 bps."
    },
    {
      "code": 6008,
      "name": "protocolPaused",
      "msg": "The protocol is paused."
    },
    {
      "code": 6009,
      "name": "marketNotTrading",
      "msg": "The market is not accepting trading actions."
    },
    {
      "code": 6010,
      "name": "marketStillTrading",
      "msg": "The market has not closed yet."
    },
    {
      "code": 6011,
      "name": "marketNotClosed",
      "msg": "The market must be closed before settlement."
    },
    {
      "code": 6012,
      "name": "marketAlreadySettled",
      "msg": "The market has already settled."
    },
    {
      "code": 6013,
      "name": "marketNotSettled",
      "msg": "The market has not settled yet."
    },
    {
      "code": 6014,
      "name": "settlementTooEarly",
      "msg": "Settlement cannot happen before the configured settlement time."
    },
    {
      "code": 6015,
      "name": "invalidPairAmount",
      "msg": "Pair amounts must be positive whole-token units."
    },
    {
      "code": 6016,
      "name": "invalidStrikePrice",
      "msg": "Strike prices must be at least $1.00 in 6-decimal fixed point."
    },
    {
      "code": 6017,
      "name": "invalidSettlementPrice",
      "msg": "Settlement prices must be positive."
    },
    {
      "code": 6018,
      "name": "invalidSettlementWindow",
      "msg": "The settlement window is malformed."
    },
    {
      "code": 6019,
      "name": "insufficientYesOpenInterest",
      "msg": "The market does not have enough yes-side open interest."
    },
    {
      "code": 6020,
      "name": "insufficientNoOpenInterest",
      "msg": "The market does not have enough no-side open interest."
    },
    {
      "code": 6021,
      "name": "insufficientWinningOpenInterest",
      "msg": "The market does not have enough unredeemed winning interest."
    },
    {
      "code": 6022,
      "name": "oracleFeedNotConfigured",
      "msg": "The oracle feed is not configured for this ticker."
    },
    {
      "code": 6023,
      "name": "oracleFeedMismatch",
      "msg": "The market feed does not match the configured ticker feed."
    },
    {
      "code": 6024,
      "name": "oraclePublishAfterClose",
      "msg": "The oracle snapshot was published after market close."
    },
    {
      "code": 6025,
      "name": "oraclePriceTooOld",
      "msg": "The oracle snapshot is too old for the configured maximum age."
    },
    {
      "code": 6026,
      "name": "oracleConfidenceTooWide",
      "msg": "The oracle confidence band exceeds the configured limit."
    },
    {
      "code": 6027,
      "name": "invalidOraclePrice",
      "msg": "The oracle snapshot price is invalid."
    },
    {
      "code": 6028,
      "name": "openInterestInvariantViolated",
      "msg": "Open interest must remain balanced before settlement."
    },
    {
      "code": 6029,
      "name": "vaultCollateralInvariantViolated",
      "msg": "The vault collateral accounting is inconsistent with open interest."
    },
    {
      "code": 6030,
      "name": "outcomeSetBeforeSettlement",
      "msg": "Outcome data cannot be set before settlement."
    },
    {
      "code": 6031,
      "name": "outcomeMissingAfterSettlement",
      "msg": "Outcome data is missing after settlement."
    },
    {
      "code": 6032,
      "name": "settlementMetadataSetTooEarly",
      "msg": "Settlement metadata was set too early."
    },
    {
      "code": 6033,
      "name": "settlementMetadataMissing",
      "msg": "Settlement metadata is missing."
    },
    {
      "code": 6034,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow or underflow detected."
    },
    {
      "code": 6035,
      "name": "marketClosedForTrading",
      "msg": "Cannot add a strike after the market close time has passed."
    },
    {
      "code": 6036,
      "name": "adminOverrideTooEarly",
      "msg": "Admin override cannot be called until 1 hour after market close."
    },
    {
      "code": 6037,
      "name": "orderExpiryExceedsMarketClose",
      "msg": "Order expiry timestamp exceeds market close time."
    },
    {
      "code": 6038,
      "name": "invalidOrderSize",
      "msg": "Order size must be positive."
    },
    {
      "code": 6039,
      "name": "phoenixMarketMismatch",
      "msg": "The provided Phoenix market does not match the market's configured Phoenix market."
    },
    {
      "code": 6040,
      "name": "phoenixCpiFailed",
      "msg": "Phoenix CPI invocation failed."
    }
  ],
  "types": [
    {
      "name": "createMarketParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ticker",
            "type": {
              "defined": {
                "name": "ticker"
              }
            }
          },
          {
            "name": "tradingDay",
            "type": "u32"
          },
          {
            "name": "strikePrice",
            "type": "u64"
          },
          {
            "name": "previousClose",
            "type": "u64"
          },
          {
            "name": "closeTimeTs",
            "type": "i64"
          },
          {
            "name": "settleAfterTs",
            "type": "i64"
          },
          {
            "name": "oracleFeedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "phoenixMarket",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "initializeConfigParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "adminAuthority",
            "type": "pubkey"
          },
          {
            "name": "operationsAuthority",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "pythReceiverProgram",
            "type": "pubkey"
          },
          {
            "name": "oracleMaximumAgeSeconds",
            "type": "u32"
          },
          {
            "name": "oracleConfidenceLimitBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "marketOutcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "unsettled"
          },
          {
            "name": "yes"
          },
          {
            "name": "no"
          }
        ]
      }
    },
    {
      "name": "marketPhase",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "trading"
          },
          {
            "name": "closed"
          },
          {
            "name": "settled"
          }
        ]
      }
    },
    {
      "name": "meridianConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "isPaused",
            "type": "bool"
          },
          {
            "name": "oracleMaximumAgeSeconds",
            "type": "u32"
          },
          {
            "name": "oracleConfidenceLimitBps",
            "type": "u16"
          },
          {
            "name": "adminAuthority",
            "type": "pubkey"
          },
          {
            "name": "operationsAuthority",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "pythReceiverProgram",
            "type": "pubkey"
          },
          {
            "name": "supportedTickers",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "tickerConfig"
                  }
                },
                7
              ]
            }
          }
        ]
      }
    },
    {
      "name": "meridianMarket",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "ticker",
            "type": {
              "defined": {
                "name": "ticker"
              }
            }
          },
          {
            "name": "phase",
            "type": {
              "defined": {
                "name": "marketPhase"
              }
            }
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "marketOutcome"
              }
            }
          },
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "yesMint",
            "type": "pubkey"
          },
          {
            "name": "noMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "phoenixMarket",
            "type": "pubkey"
          },
          {
            "name": "oracleFeedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "tradingDay",
            "type": "u32"
          },
          {
            "name": "strikePrice",
            "type": "u64"
          },
          {
            "name": "previousClose",
            "type": "u64"
          },
          {
            "name": "closeTimeTs",
            "type": "i64"
          },
          {
            "name": "settleAfterTs",
            "type": "i64"
          },
          {
            "name": "yesOpenInterest",
            "type": "u64"
          },
          {
            "name": "noOpenInterest",
            "type": "u64"
          },
          {
            "name": "totalCollateralDeposited",
            "type": "u64"
          },
          {
            "name": "totalCollateralReturned",
            "type": "u64"
          },
          {
            "name": "totalWinningRedemptions",
            "type": "u64"
          },
          {
            "name": "settledPrice",
            "type": "u64"
          },
          {
            "name": "settlementTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "orderParams",
      "docs": [
        "Parameters for a trade_yes instruction."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "tradeSide"
              }
            }
          },
          {
            "name": "numBaseLots",
            "type": "u64"
          },
          {
            "name": "priceInTicks",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "lastValidUnixTimestampInSeconds",
            "type": {
              "option": "i64"
            }
          }
        ]
      }
    },
    {
      "name": "priceFeedMessage",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "docs": [
              "`FeedId` but avoid the type alias because of compatibility issues with Anchor's `idl-build` feature."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "conf",
            "type": "u64"
          },
          {
            "name": "exponent",
            "type": "i32"
          },
          {
            "name": "publishTime",
            "docs": [
              "The timestamp of this price update in seconds"
            ],
            "type": "i64"
          },
          {
            "name": "prevPublishTime",
            "docs": [
              "The timestamp of the previous price update. This field is intended to allow users to",
              "identify the single unique price update for any moment in time:",
              "for any time t, the unique update is the one such that prev_publish_time < t <= publish_time.",
              "",
              "Note that there may not be such an update while we are migrating to the new message-sending logic,",
              "as some price updates on pythnet may not be sent to other chains (because the message-sending",
              "logic may not have triggered). We can solve this problem by making the message-sending mandatory",
              "(which we can do once publishers have migrated over).",
              "",
              "Additionally, this field may be equal to publish_time if the message is sent on a slot where",
              "where the aggregation was unsuccesful. This problem will go away once all publishers have",
              "migrated over to a recent version of pyth-agent."
            ],
            "type": "i64"
          },
          {
            "name": "emaPrice",
            "type": "i64"
          },
          {
            "name": "emaConf",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceUpdateV2",
      "docs": [
        "A price update account. This account is used by the Pyth Receiver program to store a verified price update from a Pyth price feed.",
        "It contains:",
        "- `write_authority`: The write authority for this account. This authority can close this account to reclaim rent or update the account to contain a different price update.",
        "- `verification_level`: The [`VerificationLevel`] of this price update. This represents how many Wormhole guardian signatures have been verified for this price update.",
        "- `price_message`: The actual price update.",
        "- `posted_slot`: The slot at which this price update was posted."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "writeAuthority",
            "type": "pubkey"
          },
          {
            "name": "verificationLevel",
            "type": {
              "defined": {
                "name": "verificationLevel"
              }
            }
          },
          {
            "name": "priceMessage",
            "type": {
              "defined": {
                "name": "priceFeedMessage"
              }
            }
          },
          {
            "name": "postedSlot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "ticker",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "aapl"
          },
          {
            "name": "msft"
          },
          {
            "name": "googl"
          },
          {
            "name": "amzn"
          },
          {
            "name": "nvda"
          },
          {
            "name": "meta"
          },
          {
            "name": "tsla"
          }
        ]
      }
    },
    {
      "name": "tickerConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ticker",
            "type": {
              "defined": {
                "name": "ticker"
              }
            }
          },
          {
            "name": "feedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "tradeSide",
      "docs": [
        "Which side of the Yes token market the user is trading."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "buy"
          },
          {
            "name": "sell"
          }
        ]
      }
    },
    {
      "name": "verificationLevel",
      "docs": [
        "Pyth price updates are bridged to all blockchains via Wormhole.",
        "Using the price updates on another chain requires verifying the signatures of the Wormhole guardians.",
        "The usual process is to check the signatures for two thirds of the total number of guardians, but this can be cumbersome on Solana because of the transaction size limits,",
        "so we also allow for partial verification.",
        "",
        "This enum represents how much a price update has been verified:",
        "- If `Full`, we have verified the signatures for two thirds of the current guardians.",
        "- If `Partial`, only `num_signatures` guardian signatures have been checked.",
        "",
        "# Warning",
        "Using partially verified price updates is dangerous, as it lowers the threshold of guardians that need to collude to produce a malicious price update."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "partial",
            "fields": [
              {
                "name": "numSignatures",
                "type": "u8"
              }
            ]
          },
          {
            "name": "full"
          }
        ]
      }
    }
  ]
};
