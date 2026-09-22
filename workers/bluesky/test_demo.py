import json
import unittest
from unittest.mock import patch

from demo import Demo, FIXTURES


class DemoTests(unittest.TestCase):
    def setUp(self):
        self.demo = Demo(":memory:")

    def tearDown(self):
        self.demo.db.close()

    def test_three_outcomes_without_network(self):
        with patch("socket.socket", side_effect=AssertionError("Offline demo must not use network")):
            for scenario in FIXTURES["scenarios"]:
                result = self.demo.run(scenario["id"])
                self.assertEqual(result["outcome"], scenario["expected"])
        state = self.demo.snapshot()
        self.assertEqual(len(state["alerts"]), 1)
        self.assertEqual(len(state["runs"]), 3)
        self.assertTrue(state["alerts"][0]["summary"].startswith("[DEMO - NOT A REAL ALERT]"))
        self.assertTrue(state["alerts"][0]["bluesky_uri"].startswith("demo://"))

    def test_replay_keeps_id_timestamp_and_one_row(self):
        self.demo.run("accepted")
        first = self.demo.snapshot()["alerts"][0]
        self.demo.run("accepted")
        state = self.demo.snapshot()
        self.assertEqual(len(state["alerts"]), 1)
        self.assertEqual(state["alerts"][0], first)
        self.assertEqual(len(state["runs"]), 2)

    def test_ambiguity_does_not_guess_or_persist(self):
        result = self.demo.run("ambiguous")
        self.assertIsNone(result["coordinates"])
        self.assertEqual(self.demo.snapshot()["alerts"], [])
        self.assertEqual(result["stages"][-1]["status"], "skipped")

    def test_irrelevant_post_stops_before_extraction(self):
        result = self.demo.run("irrelevant")
        self.assertIsNone(result["extraction"])
        self.assertEqual(result["stages"][1]["status"], "rejected")

    def test_reset_only_clears_demo_tables(self):
        self.demo.db.execute("CREATE TABLE sentinel (value TEXT)")
        self.demo.db.execute("INSERT INTO sentinel VALUES ('keep')")
        self.demo.run("accepted")
        self.demo.reset()
        self.assertEqual(self.demo.snapshot()["alerts"], [])
        self.assertEqual(self.demo.snapshot()["runs"], [])
        self.assertEqual(self.demo.db.execute("SELECT value FROM sentinel").fetchone()[0], "keep")

    def test_unknown_scenario_changes_nothing(self):
        with self.assertRaises(ValueError):
            self.demo.run("../../.env")
        self.assertEqual(self.demo.snapshot()["runs"], [])
        json.dumps(self.demo.snapshot())


if __name__ == "__main__":
    unittest.main()
