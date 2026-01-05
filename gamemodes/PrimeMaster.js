function isPrime(num) {
    if (num <= 1) return false;
    if (num <= 3) return true;
    if (num % 2 === 0 || num % 3 === 0) return false;
    for (let i = 5; i * i <= num; i += 6) {
        if (num % i === 0 || num % (i + 2) === 0) return false;
    }
    return true;
}

function generatePrimes(min, max, count) {
    const primes = [];
    while (primes.length < count) {
        const num = Math.floor(Math.random() * (max - min + 1)) + min;
        if (isPrime(num)) {
            primes.push(num);
        }
    }
    return primes;
}

function generateComposites(min, max, count, exclude) {
    const composites = [];
    while (composites.length < count) {
        const num = Math.floor(Math.random() * (max - min + 1)) + min;
        if (!isPrime(num) && !exclude.includes(num) && !composites.includes(num)) {
            composites.push(num);
        }
    }
    return composites;
}

module.exports = {
    generateQuestion: (difficulty) => {
        let min, max;
        if (difficulty === 'easy') { min = 10; max = 99; }
        else if (difficulty === 'hard') { min = 200; max = 999; }
        else { min = 100; max = 500; } // Normal

        const prime = generatePrimes(min, max, 1)[0];
        const composites = generateComposites(min, max, 3, [prime]);

        const options = [prime, ...composites];
        // Shuffle for the "default" order
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }

        console.log(`Prime Master Mode: Generated prime ${prime} among ${composites}`);

        return {
            options: options,
            answer: prime
        };
    },

    calculateResults: (room) => {
        const correctAnswer = room.question.answer;
        const results = [];

        room.users.forEach(user => {
            const userAnswer = room.roundAnswers[user.id]; // { value: number, time: timestamp }

            if (userAnswer && userAnswer.value == correctAnswer) {
                results.push({
                    id: user.id,
                    name: user.name,
                    correct: true,
                    time: userAnswer.time || Infinity,
                    answer: userAnswer.value
                });
            } else {
                results.push({
                    id: user.id,
                    name: user.name,
                    correct: false,
                    time: Infinity,
                    answer: userAnswer ? userAnswer.value : null
                });
            }
        });

        // Sort winners by time (fastest first)
        const winners = results.filter(r => r.correct).sort((a, b) => a.time - b.time);
        const losers = results.filter(r => !r.correct);

        // Group winners by time to handle ties
        const pointRewards = [100, 80, 60, 40, 20];
        let currentRewardIndex = 0;

        for (let i = 0; i < winners.length; i++) {
            // Check if this winner has the same time as the previous one
            if (i > 0 && winners[i].time === winners[i - 1].time) {
                // Same time, use same reward index as previous
            } else if (i > 0) {
                // Different time, advance reward index
                currentRewardIndex = i;
            }

            const res = winners[i];
            const user = room.users.find(u => u.id === res.id);
            if (user) {
                const awarded = pointRewards[currentRewardIndex] || 10;
                user.score += awarded;
                res.awarded = awarded;
            }
        }

        losers.forEach(res => {
            res.awarded = 0;
        });

        // Re-combine for rankings display
        const finalRankings = [...winners, ...losers];

        // Determine tie status for front-end
        let isTie = false;
        if (winners.length > 1) {
            isTie = winners[0].time === winners[1].time;
        }

        return {
            winner: winners.length > 0 ? winners[0].name : "No one",
            correctAnswer: correctAnswer,
            rankings: finalRankings,
            isTie: isTie,
            mode: 'prime_master'
        };
    }
};
