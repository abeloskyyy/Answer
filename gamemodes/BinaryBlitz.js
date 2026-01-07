module.exports = {
    // Generate a new question
    generateQuestion: (difficulty) => {
        // Easy: 0-15 (4 bits)
        // Normal: 0-255 (8 bits)
        // Hard: 0-4095 (12 bits)

        let min, max;
        if (difficulty === 'easy') { min = 0; max = 32; } // 0 to 31
        else if (difficulty === 'hard') { min = 0; max = 4096; } // 0 to 4095
        else { min = 0; max = 256; } // Normal: 0 to 255

        const num = Math.floor(Math.random() * (max - min)) + min;
        const answer = num.toString(2); // Convert to binary string

        // Log for debugging
        console.log(`Binary Blitz Mode: Generated ${num} -> ${answer}`);

        return { question: num, answer: answer };
    },

    // Process results for the round
    calculateResults: (room) => {
        const correctAnswer = room.question.answer;
        const startTime = room.roundStartTime;
        const results = [];

        room.users.forEach(user => {
            let answerData = room.roundAnswers[user.id];

            // Check if answer exists
            if (answerData) {
                const userAnswer = answerData.value;
                const timeTaken = answerData.time;

                // Strict string comparison for binary
                if (userAnswer === correctAnswer) {
                    results.push({
                        id: user.id,
                        name: user.name,
                        answer: userAnswer,
                        time: timeTaken,
                        correct: true
                    });
                } else {
                    results.push({
                        id: user.id,
                        name: user.name,
                        answer: userAnswer,
                        time: Infinity, // Treated as did not finish for ranking purposes
                        correct: false
                    });
                }
            } else {
                // Did not answer
                results.push({
                    id: user.id,
                    name: user.name,
                    answer: null,
                    time: Infinity,
                    correct: false
                });
            }
        });

        // Sort: Correct answers first, then by time (ascending)
        results.sort((a, b) => {
            if (a.correct && !b.correct) return -1;
            if (!a.correct && b.correct) return 1;
            return a.time - b.time;
        });

        // Assign points
        const pointRewards = [100, 80, 60, 40, 20];
        let currentRewardIndex = 0;

        results.forEach((res, index) => {
            if (res.correct) {
                // Check of tie (unlikely with ms precision but possible)
                if (index > 0 && results[index].time === results[index - 1].time) {
                    // Tie, same rank index
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

        // Determine tie
        let isTie = false;
        if (results.length > 1 && results[0].correct && results[1].correct) {
            isTie = results[0].time === results[1].time;
        }

        return {
            winner: (results[0].correct) ? results[0].name : "No one",
            correctAnswer: correctAnswer,
            rankings: results,
            isTie: isTie,
            mode: 'binary_blitz'
        };
    }
};
