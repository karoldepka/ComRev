import os
import unittest
from unittest.mock import patch

import httpx

from structable_agent.domain_names import (
    MAX_SYLLABLES,
    TLD_DOMAINS,
    check_domain_availability,
    check_google_results,
    count_syllables,
    generate_domain_candidates,
)


class FakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    async def get(self, url, params=None):
        self.calls.append((url, params))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    async def post(self, url, headers=None, json=None):
        self.calls.append((url, headers, json))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def response(status_code, url, json_payload=None):
    return httpx.Response(
        status_code,
        json=json_payload,
        request=httpx.Request("GET", url),
    )


class DomainNameTests(unittest.IsolatedAsyncioTestCase):
    def test_candidates_follow_hard_constraints(self):
        candidates = generate_domain_candidates("offline table with comments and notes", limit=40)

        self.assertGreater(len(candidates), 0)
        for candidate in candidates:
            self.assertIn(candidate.tld, TLD_DOMAINS)
            self.assertIn("i", candidate.label)
            self.assertIn("t", candidate.label)
            self.assertLessEqual(candidate.syllables, MAX_SYLLABLES)

    def test_syllable_counter_keeps_intek_short(self):
        self.assertEqual(count_syllables("intek"), 2)
        self.assertLessEqual(count_syllables("gridtek"), MAX_SYLLABLES)

    async def test_rdap_404_marks_domain_available(self):
        client = FakeClient(
            [
                response(
                    200,
                    "https://data.iana.org/rdap/dns.json",
                    {"services": [[["ai"], ["https://rdap.example/"]]]},
                ),
                response(404, "https://rdap.example/domain/brand.ai"),
            ]
        )

        result = await check_domain_availability(client, "brand.ai")

        self.assertIs(result["available"], True)
        self.assertEqual(result["method"], "rdap")

    async def test_google_check_reports_unconfigured_without_api_keys(self):
        with patch.dict(os.environ, {}, clear=True):
            result = await check_google_results(FakeClient([]), "InTek", "intek.ai")

        self.assertEqual(result["status"], "unconfigured")
        self.assertIn("google.com/search", result["search_url"])

    async def test_google_check_prefers_serper_api_key(self):
        client = FakeClient(
            [
                response(
                    200,
                    "https://google.serper.dev/search",
                    {
                        "organic": [
                            {
                                "title": "InTek example",
                                "link": "https://example.com",
                                "snippet": "A result",
                                "position": 1,
                            }
                        ],
                        "searchInformation": {"totalResults": "1"},
                    },
                )
            ]
        )

        with patch.dict(os.environ, {"SERPER_API_KEY": "serper-key"}, clear=True):
            result = await check_google_results(client, "InTek", "intek.ai")

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["provider"], "serper")
        self.assertEqual(result["total_results"], 1)
        self.assertEqual(result["result_count"], 1)
        self.assertEqual(client.calls[0][0], "https://google.serper.dev/search")
