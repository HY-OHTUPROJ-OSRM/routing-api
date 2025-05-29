-- This file defines vehicle class cutoffs for weight and height.
return {
    -- Weight is in kilograms
    weight_classes = {
        { name = "under10k", cutoff = 10000 },
        { name = "under20k", cutoff = 20000 },
        { name = "under30k", cutoff = 30000 }
    },
    -- Height is in meters
    height_classes = {
        { name = "under3m", cutoff = 3.0 },
        { name = "under4m", cutoff = 4.0 },
        { name = "under5m", cutoff = 5.0 }
    }
}
