-- This file defines vehicle class cutoffs for weight and height.
return {
    -- Weight is in kilograms
    weight_classes = {
        { name = "weightLow", cutoff = 10000 },
        { name = "weightMedium", cutoff = 20000 },
        { name = "weightHigh", cutoff = 30000 }
    },
    -- Height is in meters
    height_classes = {
        { name = "heightLow", cutoff = 3.0 },
        { name = "heightMedium", cutoff = 4.0 },
        { name = "heightHigh", cutoff = 5.0 }
    }
}
