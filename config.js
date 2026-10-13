// Million Dollar Hour - Configuration File
const CONFIG = {
    appName: "Million Dollar Hour",
    version: "1.0.0",
    pricing: {
        founding: {
            monthly: "$4.99",
            yearly: "$29",
            lifetime: "$39"
        },
        regular: {
            monthly: "$12.99",
            yearly: "$79"
        },
        india: {
            monthly: "₹149",
            yearly: "₹999"
        }
    },
    limits: {
        freeSessionsPerDay: 2
    },
    ladder: [
        { level: 1, title: "Intern", minCoins: 0 },
        { level: 2, title: "Hustler", minCoins: 500 },
        { level: 3, title: "Manager", minCoins: 2000 },
        { level: 4, title: "Boss", minCoins: 5000 },
        { level: 5, title: "Millionaire", minCoins: 10000 }
    ]
};
