"""Compliance gate tests: the rules that must never be bypassed."""
import pytest

from src.compliance.registry import (
    _domain_excluded, _in_scope, _matches_manual_only, host_matches, host_of,
)
from src.compliance.robots import parse_crawl_delay, summarize_rules


class TestHostParsing:
    def test_host_of_strips_credentials_port_and_case(self):
        assert host_of("https://user:pw@ANPP.dz:443/x") == "anpp.dz"
        assert host_of("https://www.anpp.dz/") == "www.anpp.dz"
        assert host_of("not a url") == ""

    def test_host_matches_allows_subdomains_only(self):
        assert host_matches("anpp.dz", "anpp.dz")
        assert host_matches("rcp.anpp.dz", "anpp.dz")
        assert not host_matches("evil-anpp.dz", "anpp.dz")
        assert not host_matches("anpp.dz.evil.com", "anpp.dz")
        assert not host_matches("anpp.dz", "")


class TestExcludedDomains:
    @pytest.mark.parametrize("url", [
        "https://wordpress.com/x",
        "https://www.wordpress.com/x",
        "https://facebook.com/x",
        "https://www.facebook.com/x",
        "https://x.com/x",
        "https://sub.reddit.com/x",
    ])
    def test_excluded(self, url):
        assert _domain_excluded(url)

    @pytest.mark.parametrize("url", [
        "https://anpp.dz/x",
        "https://base-donnees-publique.medicaments.gouv.fr/x",
    ])
    def test_not_excluded(self, url):
        assert _domain_excluded(url) == ""


class TestManualOnly:
    def test_apex_and_subdomain_of_msp(self):
        assert _matches_manual_only("https://msp.dz/nomenclature")
        assert _matches_manual_only("https://www.msp.dz/nomenclature/liste")
        assert _matches_manual_only("https://pharmacie.msp.dz/nomenclature")

    def test_other_paths_are_not_manual_only(self):
        assert _matches_manual_only("https://msp.dz/autre") == ""

    def test_ministry_nomenclature_page(self):
        assert _matches_manual_only("https://sante.gov.dz/nomenclature")


class TestScope:
    def test_scope_rejects_lookalike_domains(self):
        assert not _in_scope("https://evil-anpp.dz/x.pdf", "anpp.dz", "*")
        assert not _in_scope("https://anpp.dz@evil.com/x.pdf", "anpp.dz", "*")

    def test_scope_requires_a_base_domain(self):
        assert not _in_scope("https://anpp.dz/x.pdf", "", "*")

    def test_scope_path_prefix(self):
        assert _in_scope("https://anpp.dz/wpfd_file/x/", "anpp.dz", "/wpfd_file/")
        assert not _in_scope("https://anpp.dz/secret/", "anpp.dz", "/wpfd_file/")


class TestRobotsSummary:
    def test_empty_disallow_means_allow_all(self):
        rules = summarize_rules("User-agent: *\nDisallow:")
        assert "disallow" not in rules.lower()

    def test_disallow_is_reported(self):
        rules = summarize_rules("User-agent: *\nDisallow: /wp-admin/")
        assert "disallow: /wp-admin/" in rules.lower()

    def test_crawl_delay(self):
        assert parse_crawl_delay("User-agent: *\nCrawl-delay: 7") == 7.0
        assert parse_crawl_delay("User-agent: *\nDisallow: /x") == 0.0
