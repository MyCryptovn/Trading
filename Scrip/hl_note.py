# --- Đánh giá funding & OI cực đoan ---
        funding_bias = ""
        if funding > 0.0008:
            funding_bias = " Funding is strongly positive (longs overcrowded, higher reversal risk)."
        elif funding < -0.0005:
            funding_bias = " Funding is strongly negative (shorts overcrowded, short-squeeze potential)."
        elif abs(funding) < 0.0001:
            funding_bias = " Funding near neutral."

        oi_bias = ""
        if oi > 50_000_000 and chg > 0.05:
            oi_bias = " Open interest is elevated with price rising (trend may continue but crowded)."
        elif oi > 50_000_000 and chg < -0.05:
            oi_bias = " Open interest elevated while price falling (possible forced selling risk)."
