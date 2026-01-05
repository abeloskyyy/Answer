module.exports = {
    // Generate a new question
    generateQuestion: (difficulty) => {
        // Difficulty controls the MAGNITUDE of the number
        // Easy: 2-3 digits (100 - 999) -> Root ~10-31
        // Normal: 5-6 digits (10,000 - 999,999) -> Root ~100-999
        // Hard: 7-8 digits (1,000,000 - 99,999,999) -> Root ~1000-9999

        let min, max;
        if (difficulty === 'easy') { min = 100; max = 1000; }
        else if (difficulty === 'hard') { min = 1000000; max = 100000000; }
        else { min = 10000; max = 1000000; } // Normal

        const num = Math.floor(Math.random() * (max - min)) + min;
        const answer = Math.floor(Math.sqrt(num));

        // Log for debugging
        console.log(`Answer Mode: Generated sqrt(${num}) = ~${answer}`);

        return { question: num, answer: answer };
    },

    // Process results for the round
    calculateResults: (room) => {
        const correctAnswer = room.question.answer;
        const results = [];

        // Calculate differences
        room.users.forEach(user => {
            let answerData = room.roundAnswers[user.id];
            let userAnswer = (answerData && typeof answerData === 'object') ? answerData.value : answerData;

            // Convert to number if it's a string (since server now sends raw input)
            if (userAnswer !== undefined && userAnswer !== null && typeof userAnswer === 'string') {
                userAnswer = parseInt(userAnswer);
            }

            if (userAnswer !== undefined && userAnswer !== null && !isNaN(userAnswer)) {
                const diff = Math.abs(userAnswer - correctAnswer);
                results.push({
                    id: user.id,
                    name: user.name,
                    answer: userAnswer,
                    diff: diff
                });
            } else {
                // Did not answer or disconnected before answering
                results.push({
                    id: user.id,
                    name: user.name,
                    answer: null,
                    diff: Infinity
                });
            }
        });

        // Sort by diff (ascending)
        results.sort((a, b) => a.diff - b.diff);

        // Assign points based on rank with tie handling
        const pointRewards = [100, 80, 60, 40, 20];
        let currentRewardIndex = 0;

        results.forEach((res, index) => {
            if (res.answer !== null && res.diff !== Infinity) {
                // Check for tie with previous player
                if (index > 0 && results[index].diff === results[index - 1].diff) {
                    // Same difference, use same reward index
                } else if (index > 0) {
                    currentRewardIndex = index;
                }

                const user = room.users.find(u => u.id === res.id);
                if (user) {
                    let awarded = pointRewards[currentRewardIndex] || 10;
                    user.score += awarded;
                    res.awarded = awarded;
                }
            } else {
                res.awarded = 0;
            }
        });

        // Determine tie status for front-end
        let isTie = false;
        if (results.length > 1 && results[0].answer !== null && results[0].diff !== Infinity) {
            isTie = results[0].diff === results[1].diff;
        }

        return {
            winner: (results[0].answer !== null && results[0].diff !== Infinity) ? results[0].name : "No one",
            correctAnswer: correctAnswer,
            rankings: results,
            isTie: isTie,
            mode: 'answer'
        };
    }
};
